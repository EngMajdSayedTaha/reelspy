import Anthropic from "@anthropic-ai/sdk";
import { numEnv } from "@/lib/utils/env";

// OpenAI-compatible chat helper with provider auto-detect.
//
// Priority: NVIDIA (build.nvidia.com, free OpenAI-compatible endpoint) when
// NVIDIA_API_KEY is set, otherwise Anthropic when ANTHROPIC_API_KEY is set.
// Returns null only when NEITHER key is configured, so callers can fall back to
// their templated responses. Mirrors the raw-fetch pattern in
// lib/transcription/groq.ts — no extra SDK needed for the NVIDIA path.

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

// The free NVIDIA endpoint has no SLA: requests can stall (cold model load),
// so every attempt is bounded by a hard timeout instead of hanging until the
// platform's function limit. Tunable per-deploy.
const AI_TIMEOUT_MS = numEnv("AI_TIMEOUT_MS", 25_000);
// Total attempts = 1 + AI_MAX_RETRIES. Covers the free tier's frequent transient
// 429/503s and network blips that otherwise drop users to the generic fallback.
const AI_MAX_RETRIES = numEnv("AI_MAX_RETRIES", 2);
const AI_RETRY_BASE_MS = numEnv("AI_RETRY_BASE_MS", 700);
// Hard ceiling on the whole retry loop. Kept under a typical 60s serverless
// function limit so we always return a real answer/fallback rather than getting
// killed mid-retry. Per-attempt timeouts are clamped to the time remaining.
const AI_TOTAL_BUDGET_MS = numEnv("AI_TOTAL_BUDGET_MS", 55_000);
// Don't start another attempt unless enough of the budget remains to be useful.
const AI_MIN_ATTEMPT_MS = 3_000;
// Don't wait forever on a server-provided Retry-After — cap it so a wedged
// upstream can't blow past our own timeout budget.
const AI_RETRY_MAX_WAIT_MS = 10_000;

// Transient HTTP statuses worth retrying: request timeout, conflict, too-early,
// rate limit, and the 5xx family the NVIDIA gateway returns while a model is
// spinning up or overloaded.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export type ChatProvider = "nvidia" | "anthropic";

export type ChatResult = {
  text: string;
  provider: ChatProvider;
};

export type ChatOptions = {
  system: string;
  user: string;
  maxTokens: number;
  /** Ask the model for a strict JSON object (OpenAI-style response_format). */
  jsonObject?: boolean;
};

/** True when at least one AI provider key is configured. */
export function aiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY);
}

// Reasoning models (e.g. deepseek-r1) emit a <think>…</think> preamble before
// the answer. Strip it so downstream JSON parsing sees only the final content.
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A failed attempt that is safe to retry (transient upstream state or timeout).
// `retryAfterMs` carries a server-provided Retry-After hint when present.
class RetryableError extends Error {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

// Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds,
// clamped to our max wait so a hostile/huge value can't stall the request.
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  let ms: number | undefined;
  if (Number.isFinite(seconds)) {
    ms = seconds * 1000;
  } else {
    const date = Date.parse(header);
    if (!Number.isNaN(date)) ms = date - Date.now();
  }
  if (ms == null || ms <= 0) return undefined;
  return Math.min(ms, AI_RETRY_MAX_WAIT_MS);
}

// One NVIDIA request, bounded by `timeoutMs`. Throws RetryableError for
// transient failures (timeout, network, 429/5xx) and a plain Error otherwise.
async function nvidiaAttempt(
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(NVIDIA_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError (our timeout) and network failures are both transient.
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network error";
    throw new RetryableError(`NVIDIA chat ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = `NVIDIA chat failed (${response.status}): ${detail.slice(0, 300)}`;
    if (RETRYABLE_STATUS.has(response.status)) {
      throw new RetryableError(message, parseRetryAfter(response.headers.get("Retry-After")));
    }
    throw new Error(message);
  }

  const json = (await response.json()) as OpenAiChatResponse;
  return stripReasoning(json.choices?.[0]?.message?.content?.trim() ?? "");
}

async function callNvidia(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  const model = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens,
    temperature: 0.7,
    // Discourage the repetition loops Llama falls into on longer JSON outputs —
    // the root cause of duplicated growth-note rows. Mild values keep quality.
    frequency_penalty: 0.3,
    presence_penalty: 0.1,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.jsonObject) {
    body.response_format = { type: "json_object" };
  }

  const deadline = Date.now() + AI_TOTAL_BUDGET_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    // Clamp this attempt to whatever time is left in the overall budget.
    const remaining = deadline - Date.now();
    const attemptTimeout = Math.min(AI_TIMEOUT_MS, remaining);
    try {
      const text = await nvidiaAttempt(body, apiKey, attemptTimeout);
      return { text, provider: "nvidia" };
    } catch (err) {
      lastError = err;
      // Only transient failures are retried; a 4xx (bad request/auth) throws now.
      if (!(err instanceof RetryableError) || attempt === AI_MAX_RETRIES) {
        throw err;
      }
      // Exponential backoff, honoring a server Retry-After hint when it's larger.
      const backoff = AI_RETRY_BASE_MS * 2 ** attempt;
      const wait = Math.max(backoff, err.retryAfterMs ?? 0);
      // Bail out early if the budget can't fit the backoff plus a useful attempt.
      if (deadline - Date.now() - wait < AI_MIN_ATTEMPT_MS) {
        throw err;
      }
      console.warn(
        `NVIDIA chat attempt ${attempt + 1}/${AI_MAX_RETRIES + 1} failed (${err.message}); retrying in ${wait}ms`
      );
      await sleep(wait);
    }
  }

  // Unreachable — the loop either returns or throws — but satisfies the type.
  throw lastError instanceof Error ? lastError : new Error("NVIDIA chat failed");
}

async function callAnthropic(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  // Mirror the NVIDIA path's timeout/retry budget. The SDK retries transient
  // errors (429/5xx/network) on its own with backoff.
  const anthropic = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES });

  const response = await anthropic.messages.create({
    model: DEFAULT_ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();

  return { text, provider: "anthropic" };
}

/**
 * Run a chat completion against the configured provider. Returns null only when
 * no provider key is set; throws on API errors so callers can log + fall back.
 */
export async function chat(opts: ChatOptions): Promise<ChatResult | null> {
  if (process.env.NVIDIA_API_KEY) {
    return callNvidia(opts);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(opts);
  }
  return null;
}
