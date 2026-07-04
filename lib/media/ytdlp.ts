import { execFile } from "node:child_process";
import { access, chmod, constants, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BUNDLED_BIN = path.join(process.cwd(), "bin", "yt-dlp_linux");
const RUNTIME_BIN = "/tmp/yt-dlp_linux";
const COOKIES_PATH = "/tmp/yt-dlp-cookies.txt";

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

// Writes the optional base64-encoded cookies.txt (needed for many Instagram
// reels) to a temp file and returns the extra CLI args.
async function cookieArgs(): Promise<string[]> {
  const encoded = process.env.YTDLP_COOKIES_B64;
  if (!encoded) {
    return [];
  }
  await writeFile(COOKIES_PATH, Buffer.from(encoded, "base64").toString("utf8"), "utf8");
  return ["--cookies", COOKIES_PATH];
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
  cookies: boolean;
  error: string | null;
};

// Lightweight health check: confirms the binary resolves and runs (`--version`).
export async function probeYtDlp(): Promise<YtDlpProbe> {
  const cookies = Boolean(process.env.YTDLP_COOKIES_B64);
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

// Runs `yt-dlp --dump-single-json --skip-download` to fetch metadata + a direct
// media URL WITHOUT downloading the video binary.
export async function getReelMetadata(url: string): Promise<ReelMetadata> {
  const binary = await resolveBinary();
  const cookies = await cookieArgs();

  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-cache-dir",
    ...cookies,
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
    throw new Error(`yt-dlp extraction failed: ${detail.slice(0, 400)}`);
  }

  const info = JSON.parse(stdout) as YtDlpInfo;

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
