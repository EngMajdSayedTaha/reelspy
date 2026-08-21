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
  /**
   * The parsed JSON body, when there was one. Endpoints that refuse an action
   * pending confirmation, or that return the counts behind a refusal, put that
   * detail here — `message` alone can't carry a decision the caller has to make.
   */
  body?: unknown;
  constructor(message: string, status: number, retryAfterSeconds?: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.body = body;
  }
}

// ── Step-up challenge hook ──────────────────────────────────────────────────
// The admin panel can answer a request with "prove it's really you" instead of
// a result: `elevation_required` (the panel re-locked under you) or
// `reauth_required` (this particular action is destructive enough to want the
// passphrase again — see lib/admin/critical-actions.ts).
//
// Handling that at 30-odd call sites would guarantee some of them get it wrong,
// and the ones that get it wrong would be the destructive ones. So the admin
// shell registers ONE handler here (components/admin/security/ReauthProvider):
// requestJson pauses the failed call, the provider collects the passphrase, and
// the original request is replayed exactly once. Every admin action inherits
// the behaviour without knowing it exists.
export type ChallengeCode = "reauth_required" | "elevation_required";

/** Resolves true when the challenge was satisfied and the call may be retried. */
export type ChallengeHandler = (code: ChallengeCode, action: string | null) => Promise<boolean>;

let challengeHandler: ChallengeHandler | null = null;

/** Registers the handler; returns an unsubscribe for the provider's cleanup. */
export function setApiChallengeHandler(handler: ChallengeHandler): () => void {
  challengeHandler = handler;
  return () => {
    if (challengeHandler === handler) challengeHandler = null;
  };
}

// A retry has to send the same bytes again. Strings (every JSON call in this
// app) and empty bodies replay safely; a stream or a FormData may already be
// consumed, so those surface the 403 to the caller instead.
function isReplayable(body: BodyInit | null | undefined): boolean {
  return body == null || typeof body === "string";
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
  return execute<T>(input, init, true);
}

async function execute<T>(
  input: RequestInfo | URL,
  init: (RequestInit & { timeoutMs?: number }) | undefined,
  allowChallenge: boolean
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

    // Step-up challenge: hand it to the registered handler and, if the admin
    // satisfies it, replay the original request once. `allowChallenge` is false
    // on that replay, so a server stuck returning 403 can never loop.
    const code = record && typeof record.code === "string" ? record.code : null;
    if (
      response.status === 403 &&
      allowChallenge &&
      challengeHandler &&
      (code === "reauth_required" || code === "elevation_required") &&
      isReplayable(rest.body)
    ) {
      const action = record && typeof record.action === "string" ? record.action : null;
      const satisfied = await challengeHandler(code, action);
      if (satisfied) return execute<T>(input, init, false);
    }

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

    throw new ApiError(message, response.status, retryAfterSeconds, body);
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
