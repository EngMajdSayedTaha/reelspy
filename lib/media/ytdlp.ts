import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, constants, copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  getIgCookieStatus,
  loadIgCookiesB64,
  recordCookieFailure,
  recordCookieSuccess,
} from "@/lib/media/ig-cookies";
import { classifyYtDlpError, YtDlpExtractionError } from "@/lib/media/ytdlp-errors";

const execFileAsync = promisify(execFile);

const BUNDLED_BIN = path.join(process.cwd(), "bin", "yt-dlp_linux");
const RUNTIME_BIN = "/tmp/yt-dlp_linux";

export type ReelMetadata = {
  id: string | null;
  durationSec: number | null;
  thumbnail: string | null;
  uploader: string | null;
  /** e.g. https://www.instagram.com/majdst_codes/ — contains the real handle */
  uploader_url: string | null;
  /** Full caption / description text from the post */
  description: string | null;
  // Direct, short-lived CDN URL good for immediate transcription.
  mediaUrl: string | null;
};

type YtDlpFormat = {
  url?: string;
  acodec?: string;
  vcodec?: string;
  ext?: string;
  protocol?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
};

type YtDlpInfo = {
  id?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  uploader_url?: string;
  description?: string;
  url?: string;
  formats?: YtDlpFormat[];
};

export class YtDlpUnavailableError extends Error {}

// Locates a runnable yt-dlp binary. The bundled file lives in a read-only area
// on Vercel, so we copy it to /tmp (writable) and mark it executable once.
async function resolveBinary(): Promise<string> {
  if (process.env.YTDLP_BIN) {
    return process.env.YTDLP_BIN;
  }

  try {
    await access(RUNTIME_BIN, constants.X_OK);
    return RUNTIME_BIN;
  } catch {
    // fall through and provision it
  }

  try {
    await access(BUNDLED_BIN, constants.R_OK);
  } catch {
    throw new YtDlpUnavailableError(
      "yt-dlp binary not found. It is downloaded at install time via scripts/fetch-ytdlp.mjs."
    );
  }

  await copyFile(BUNDLED_BIN, RUNTIME_BIN);
  await chmod(RUNTIME_BIN, 0o755);
  return RUNTIME_BIN;
}

// Every run gets its OWN cookie file: /tmp persists across warm invocations
// and yt-dlp REWRITES the file passed via --cookies (that rewrite is how we
// capture Instagram's session rotation), so a shared fixed path would let
// overlapping runs corrupt each other's jar and the write-back read torn state.
async function writeCookieFile(b64: string): Promise<string> {
  const p = path.join("/tmp", `ig-cookies-${randomUUID()}.txt`);
  await writeFile(p, Buffer.from(b64, "base64").toString("utf8"), { mode: 0o600 });
  return p;
}

async function removeQuietly(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {
    // best-effort; /tmp resets on cold start anyway
  }
}

// Whisper only needs the audio, and Groq's free tier caps uploads at 25 MB, so
// pick the SMALLEST format that still has an audio track: an audio-only stream
// if one exists, otherwise the lowest-bitrate progressive video. This keeps the
// payload well under the limit without needing ffmpeg.
function hasAudio(f: YtDlpFormat): boolean {
  return Boolean(f.acodec && f.acodec !== "none");
}

function isDirectHttp(f: YtDlpFormat): boolean {
  return !f.protocol || f.protocol === "https" || f.protocol === "http";
}

function approxSize(f: YtDlpFormat): number {
  return f.filesize ?? f.filesize_approx ?? (f.tbr ? f.tbr * 1_000 : Number.POSITIVE_INFINITY);
}

function smallest(formats: YtDlpFormat[]): YtDlpFormat | null {
  if (formats.length === 0) return null;
  return [...formats].sort((a, b) => approxSize(a) - approxSize(b))[0];
}

function pickMediaUrl(info: YtDlpInfo): string | null {
  const formats = (info.formats ?? []).filter((f) => f.url && isDirectHttp(f));

  // 1) Audio-only formats — smallest possible payload.
  const audioOnly = formats.filter((f) => hasAudio(f) && (!f.vcodec || f.vcodec === "none"));
  const bestAudio = smallest(audioOnly);
  if (bestAudio?.url) return bestAudio.url;

  // 2) Smallest progressive format that still carries audio.
  const progressive = formats.filter(hasAudio);
  const smallestProgressive = smallest(progressive);
  if (smallestProgressive?.url) return smallestProgressive.url;

  // 3) Fallback to the top-level URL.
  return info.url ?? null;
}

export type YtDlpProbe = {
  available: boolean;
  version: string | null;
  binaryPath: string | null;
  cookies: { configured: boolean; source: "db" | "env" | null };
  error: string | null;
};

// Lightweight health check: confirms the binary resolves and runs (`--version`).
export async function probeYtDlp(): Promise<YtDlpProbe> {
  const status = await getIgCookieStatus();
  const cookies = { configured: status.configured, source: status.source };
  try {
    const binary = await resolveBinary();
    const { stdout } = await execFileAsync(binary, ["--version", "--no-cache-dir"], {
      timeout: 15_000,
      env: { ...process.env, TMPDIR: "/tmp", HOME: "/tmp" },
    });
    return { available: true, version: stdout.trim(), binaryPath: binary, cookies, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "yt-dlp probe failed";
    return { available: false, version: null, binaryPath: null, cookies, error: message.slice(0, 300) };
  }
}

// One `yt-dlp --dump-single-json --skip-download` attempt. Failures throw a
// classified YtDlpExtractionError carrying yt-dlp's real stderr complaint.
async function runYtDlpJson(
  binary: string,
  url: string,
  cookieFile: string | null
): Promise<YtDlpInfo> {
  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-cache-dir",
    ...(cookieFile ? ["--cookies", cookieFile] : []),
    url,
  ];

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(binary, args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      env: { ...process.env, TMPDIR: "/tmp", HOME: "/tmp" },
    }));
  } catch (error) {
    // execFile errors carry yt-dlp's real complaint on stderr (e.g.
    // "login required", "rate-limit reached", "video unavailable").
    const err = error as { stderr?: string; message?: string };
    const detail = (err.stderr?.trim() || err.message || "yt-dlp failed").toString();
    throw new YtDlpExtractionError(detail, classifyYtDlpError(detail), Boolean(cookieFile));
  }

  return JSON.parse(stdout) as YtDlpInfo;
}

// Runs one cookie-authenticated attempt and, on success, persists the state
// Instagram rotated during the request (yt-dlp rewrote the jar on exit) plus a
// last_ok_at stamp. Bookkeeping is fail-open: it must never fail an extraction
// that already succeeded.
async function runWithCookies(binary: string, url: string, b64: string): Promise<YtDlpInfo> {
  const cookieFile = await writeCookieFile(b64);
  const written = Buffer.from(b64, "base64").toString("utf8");
  try {
    const info = await runYtDlpJson(binary, url, cookieFile);
    try {
      const after = await readFile(cookieFile, "utf8");
      // Last-write-wins across concurrent lambdas is fine: sessionid (the
      // long-lived credential) is identical between them; only ancillary
      // cookies (csrftoken, mid, …) diverge, and any jar with a valid
      // sessionid works.
      await recordCookieSuccess(
        after !== written ? Buffer.from(after, "utf8").toString("base64") : undefined
      );
    } catch (bookkeepingError) {
      console.warn(
        "[ytdlp] cookie write-back skipped:",
        bookkeepingError instanceof Error ? bookkeepingError.message : bookkeepingError
      );
    }
    return info;
  } catch (error) {
    // Only auth/challenge failures on an AUTHENTICATED attempt mean the
    // session itself is dead; rate limits and removed posts do not.
    if (
      error instanceof YtDlpExtractionError &&
      (error.kind === "authRequired" || error.kind === "botCheck")
    ) {
      await recordCookieFailure(error.message);
    }
    throw error;
  } finally {
    await removeQuietly(cookieFile);
  }
}

export type CookieMode = "auto" | "require" | "none";

function toMetadata(info: YtDlpInfo): ReelMetadata {
  return {
    id: info.id ?? null,
    durationSec: typeof info.duration === "number" ? Math.round(info.duration) : null,
    thumbnail: info.thumbnail ?? null,
    uploader: info.uploader ?? null,
    uploader_url: info.uploader_url ?? null,
    description: info.description ?? null,
    mediaUrl: pickMediaUrl(info),
  };
}

// Fetches metadata + a direct media URL WITHOUT downloading the video binary.
//
// cookieMode:
//   "auto" (default) — try WITHOUT cookies first (public reels usually work and
//     every anonymous success spares the shared session), retry once WITH
//     cookies only when the failure says a login would help.
//   "require" — cookie-authenticated attempt only (health cron / live tests).
//   "none" — never use cookies.
export async function getReelMetadata(
  url: string,
  opts: { cookieMode?: CookieMode } = {}
): Promise<ReelMetadata> {
  const cookieMode = opts.cookieMode ?? "auto";
  const binary = await resolveBinary();

  if (cookieMode === "none") {
    return toMetadata(await runYtDlpJson(binary, url, null));
  }

  if (cookieMode === "require") {
    const cookies = await loadIgCookiesB64();
    if (!cookies) {
      throw new Error(
        "No Instagram cookies configured (app_settings 'ig_cookies' row or YTDLP_COOKIES_B64)."
      );
    }
    return toMetadata(await runWithCookies(binary, url, cookies.b64));
  }

  // "auto"
  try {
    return toMetadata(await runYtDlpJson(binary, url, null));
  } catch (error) {
    const retryable =
      error instanceof YtDlpExtractionError &&
      (error.kind === "authRequired" || error.kind === "rateLimited" || error.kind === "botCheck");
    if (!retryable) {
      throw error;
    }
    const cookies = await loadIgCookiesB64();
    if (!cookies) {
      throw error;
    }
    return toMetadata(await runWithCookies(binary, url, cookies.b64));
  }
}

// Validates CANDIDATE cookies (not yet stored) with a real extraction — used by
// the admin route before saving, so a bad paste is rejected instead of
// replacing a working session. Deliberately does NOT record success/failure
// state or persist rotations: the candidate isn't the active session yet.
export async function testCandidateCookies(
  b64: string,
  url: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const binary = await resolveBinary();
    const cookieFile = await writeCookieFile(b64);
    try {
      await runYtDlpJson(binary, url, cookieFile);
      return { ok: true, error: null };
    } finally {
      await removeQuietly(cookieFile);
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "test failed" };
  }
}
