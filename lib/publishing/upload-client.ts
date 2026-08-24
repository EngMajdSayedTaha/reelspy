// Browser-side upload helpers for the composer.
//
// Two things the old flow didn't do:
//
//  1. Report progress. The upload was a plain `fetch(url, {method:"PUT"})`, and
//     fetch exposes no upload progress at all — so a 200 MB reel showed a
//     spinner and nothing else for minutes. XMLHttpRequest is the only API in a
//     browser that reports `upload.onprogress`, which is why it's used here in
//     2026.
//  2. Measure the file. Dimensions and duration decide whether Instagram will
//     crop it or TikTok will reject it, and the browser can answer both before a
//     single byte is uploaded.
//
// Pure client module — no `server-only`, no server imports.

import { itemKindForMime } from "./capabilities";
import type { MediaItemKind } from "./types";

export type ProbedFile = {
  kind: MediaItemKind;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

/**
 * Read a file's real shape in the browser. Never throws: a codec the browser
 * can't decode yields nulls, and the validator treats unknown dimensions as
 * "can't say" rather than "invalid".
 */
export function probeFile(file: File): Promise<ProbedFile | null> {
  const mimeType = file.type;
  const kind = itemKindForMime(mimeType);
  if (!kind) return Promise.resolve(null);

  const base: ProbedFile = {
    kind,
    mimeType,
    bytes: file.size,
    width: null,
    height: null,
    durationSeconds: null,
  };

  const url = URL.createObjectURL(file);

  return new Promise<ProbedFile>((resolve) => {
    // Don't let a file the browser can't decode hang the composer.
    const timer = setTimeout(() => finish(base), 8000);

    function finish(result: ProbedFile) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    }

    if (kind === "image") {
      const img = new Image();
      img.onload = () =>
        finish({ ...base, width: img.naturalWidth || null, height: img.naturalHeight || null });
      img.onerror = () => finish(base);
      img.src = url;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish({
        ...base,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      });
    video.onerror = () => finish(base);
    video.src = url;
  });
}

export type PresignResponse = {
  path: string;
  uploadUrl: string;
  contentType: string;
  kind: MediaItemKind;
};

export class UploadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Upload one file straight to R2, reporting progress 0–100.
 *
 * Returns the object path the post will reference. The bytes go directly to R2
 * with a one-time presigned URL — no server hop, no Supabase 50 MB cap.
 */
export async function uploadMediaFile(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<PresignResponse> {
  const contentType = file.type || "application/octet-stream";

  const presignRes = await fetch("/api/publishing/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, fileName: file.name, bytes: file.size }),
    signal,
  });
  const presign = (await presignRes.json().catch(() => ({}))) as Partial<PresignResponse> & {
    error?: string;
  };
  if (!presignRes.ok || !presign.uploadUrl || !presign.path) {
    throw new UploadError(presign.error ?? `Could not start the upload (${presignRes.status}).`, presignRes.status);
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presign.uploadUrl!);
    // Content-Type isn't part of the presigned signature (host-only), so this is
    // just stored as the object's content type on R2.
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new UploadError(`Upload failed (${xhr.status}).`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new UploadError("Upload failed — check your connection."));
    xhr.onabort = () => reject(new UploadError("Upload cancelled."));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });

  return presign as PresignResponse;
}
