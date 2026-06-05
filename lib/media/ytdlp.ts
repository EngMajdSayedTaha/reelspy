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
  // Direct, short-lived CDN URL good for immediate transcription.
  mediaUrl: string | null;
};

type YtDlpFormat = {
  url?: string;
  acodec?: string;
  vcodec?: string;
  ext?: string;
};

type YtDlpInfo = {
  id?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
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

// Picks the best format URL that includes audio (reels are usually a single
// combined mp4; otherwise prefer a format with an audio codec).
function pickMediaUrl(info: YtDlpInfo): string | null {
  if (typeof info.url === "string" && info.url) {
    return info.url;
  }
  const formats = info.formats ?? [];
  const withAudio = [...formats].reverse().find((f) => f.url && f.acodec && f.acodec !== "none");
  if (withAudio?.url) {
    return withAudio.url;
  }
  return formats.at(-1)?.url ?? null;
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
    const message = error instanceof Error ? error.message : "yt-dlp failed";
    throw new Error(`yt-dlp extraction failed: ${message.slice(0, 300)}`);
  }

  const info = JSON.parse(stdout) as YtDlpInfo;

  return {
    id: info.id ?? null,
    durationSec: typeof info.duration === "number" ? Math.round(info.duration) : null,
    thumbnail: info.thumbnail ?? null,
    uploader: info.uploader ?? null,
    mediaUrl: pickMediaUrl(info),
  };
}
