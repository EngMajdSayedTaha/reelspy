import { toast } from "sonner";
import { getClientPrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Client-only helper (document.cookie based) so this plain module — not a
// React component — can still show localized generic messages without a
// context provider. Re-read on every call: the active locale doesn't change
// without a full page reload (see PreferencesForm), so this is cheap.
function commonDict() {
  return getDictionary(getClientPrefs().locale).common;
}

// Typed API error carrying the HTTP status so callers can react (e.g. 401),
// plus an optional retry hint (seconds) for rate-limit (429) responses.
export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// fetch + JSON wrapper with consistent error handling. Throws ApiError with a
// human-readable message derived from the response's `{ error }` body.
//
// `timeoutMs` bounds the whole request via AbortController so a wedged/slow
// endpoint (e.g. the AI routes) surfaces as a clear error instead of an
// indefinite spinner. Any caller-supplied `signal` is respected too.
export async function requestJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs, signal: callerSignal, ...rest } = init ?? {};

  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal = callerSignal ?? undefined;
  if (timeoutMs && timeoutMs > 0) {
    controller = new AbortController();
    timer = setTimeout(() => controller!.abort(), timeoutMs);
    // Fold a caller signal into ours so either can abort the request.
    if (callerSignal) callerSignal.addEventListener("abort", () => controller!.abort());
    signal = controller.signal;
  }

  let response: Response;
  try {
    response = await fetch(input, { ...rest, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(commonDict().timedOut, 0);
    }
    throw new ApiError(commonDict().networkError, 0);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(commonDict().sessionExpired, 401);
    }

    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;

    // Prefer the API's `error`, then the first `errors[]` entry, then a default.
    let message = commonDict().requestFailed(response.status);
    if (record && typeof record.error === "string" && record.error) {
      message = record.error;
    } else if (
      record &&
      Array.isArray(record.errors) &&
      typeof record.errors[0] === "string"
    ) {
      message = record.errors[0] as string;
    } else if (response.status === 429) {
      message = commonDict().igRateLimited;
    }

    // Retry hint: body field first, then the Retry-After header.
    let retryAfterSeconds: number | undefined;
    if (record && typeof record.retryAfterSeconds === "number") {
      retryAfterSeconds = record.retryAfterSeconds;
    } else {
      const header = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(header) && header > 0) retryAfterSeconds = header;
    }

    throw new ApiError(message, response.status, retryAfterSeconds);
  }

  return body as T;
}

// Central place to surface an error to the user. Shows a toast and, on auth
// failures, sends them to the login page.
export function notifyError(error: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? commonDict().unknownError;
  const message =
    error instanceof ApiError || error instanceof Error
      ? error.message || defaultFallback
      : defaultFallback;

  toast.error(message);

  if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);
  }

  return message;
}
