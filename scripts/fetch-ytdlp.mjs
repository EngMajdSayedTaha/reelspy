// Downloads the self-contained yt-dlp Linux binary into ./bin at install time.
// Runs as a postinstall hook. It is intentionally non-fatal: if the download
// fails (e.g. offline local dev), it warns and exits 0 so `npm install` still
// succeeds. On Vercel (which has network during install) the binary is fetched
// and then bundled into the function via outputFileTracingIncludes.

import { createWriteStream } from "node:fs";
import { chmod, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "bin");
const BIN_PATH = join(BIN_DIR, "yt-dlp_linux");
const DOWNLOAD_URL =
  process.env.YTDLP_DOWNLOAD_URL ??
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

async function alreadyPresent() {
  try {
    const info = await stat(BIN_PATH);
    return info.size > 1_000_000; // sanity check: real binary, not a stub
  } catch {
    return false;
  }
}

async function main() {
  // Only the Linux static binary is useful (Vercel/Lambda run Linux).
  if (process.platform !== "linux" && !process.env.YTDLP_FORCE_DOWNLOAD) {
    console.log(`[fetch-ytdlp] Skipping download on ${process.platform}.`);
    return;
  }

  if (await alreadyPresent()) {
    console.log("[fetch-ytdlp] yt-dlp binary already present, skipping.");
    return;
  }

  console.log(`[fetch-ytdlp] Downloading yt-dlp from ${DOWNLOAD_URL} ...`);
  await mkdir(BIN_DIR, { recursive: true });

  const response = await fetch(DOWNLOAD_URL, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(BIN_PATH));
  await chmod(BIN_PATH, 0o755);
  console.log("[fetch-ytdlp] yt-dlp binary ready at bin/yt-dlp_linux.");
}

main().catch((error) => {
  console.warn(`[fetch-ytdlp] Could not download yt-dlp: ${error.message}`);
  console.warn("[fetch-ytdlp] Transcription will report 'unavailable' until the binary exists.");
  process.exit(0); // never break the install
});
