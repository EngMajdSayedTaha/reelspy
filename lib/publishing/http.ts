// Server-side fetch for the publish adapters: a timeout, and a retry for the
// failures that are worth retrying.
//
// Every adapter used to call bare `fetch(url, { cache: "no-store" })`. With no
// AbortSignal a hung platform request holds a serverless function until the
// platform gives up — and with no retry, a single 503 from Meta burned the job
// to `failed` and made the user press Retry for something that would have
// worked a second later.
//
// Retries ONLY on 429, 5xx and network/timeout errors, and only for idempotent
// steps — a container-creation POST that already succeeded must never be sent
// twice, so callers pass `retries: 0` for anything that creates remote state.
// lib/instagram/graph-api.ts has the same timeout discipline; this is its
// equivalent for the publishing path, which never went through that module.

import "server-only";
import { numEnv } from "@/lib/utils/env";

export type PublishFetchOptions = {
  /** Per-attempt timeout. Defaults to PUBLISH_HTTP_TIMEOUT_MS (20s). */
  timeoutMs?: number;
  /** Extra attempts after the first. Defaults to 0 — opt in per call site. */
  retries?: number;
};

export class PublishHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "PublishHttpError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 and 5xx are the platform saying "later", not "no". */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Fetch with a timeout, retrying transient failures with jittered backoff.
 * Returns the Response untouched — callers keep their own error parsing, since
 * each platform words its errors differently.
 */
export async function publishFetch(
  url: string | URL,
  init: RequestInit = {},
  options: PublishFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? numEnv("PUBLISH_HTTP_TIMEOUT_MS", 20_000);
  const retries = Math.max(0, options.retries ?? 0);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 500ms, 1s, 2s … plus jitter so parallel carousel children don't all
      // retry on the same tick.
      await sleep(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (attempt < retries && isRetryableStatus(response.status)) {
        lastError = new PublishHttpError(
          `Upstream returned ${response.status}`,
          response.status,
          ""
        );
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      // A timeout or a dropped connection is worth another go; anything else
      // (a bad URL, an aborted request) is not going to fix itself.
      const retryable =
        error instanceof DOMException
          ? error.name === "TimeoutError" || error.name === "AbortError"
          : true;
      if (!retryable || attempt === retries) break;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}

/** `publishFetch` + JSON parse, tolerating a non-JSON error body. */
export async function publishFetchJson<T>(
  url: string | URL,
  init: RequestInit = {},
  options: PublishFetchOptions = {}
): Promise<{ ok: boolean; status: number; json: T; raw: string }> {
  const response = await publishFetch(url, init, options);
  const raw = await response.text();
  let json: T;
  try {
    json = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    json = {} as T;
  }
  return { ok: response.ok, status: response.status, json, raw };
}
