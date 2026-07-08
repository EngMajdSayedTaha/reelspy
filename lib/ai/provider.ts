import Anthropic from "@anthropic-ai/sdk";
import { numEnv } from "@/lib/utils/env";
import type { AiTier } from "./tier";
import { entitlementsFor, type AiModel } from "@/lib/billing/entitlements";

// OpenAI-compatible chat helper with provider auto-detect.
//
// Priority: NVIDIA (build.nvidia.com, free OpenAI-compatible endpoint) when
// NVIDIA_API_KEY is set, otherwise Anthropic when ANTHROPIC_API_KEY is set.
// Returns null only when NEITHER key is configured, so callers can fall back to
// their templated responses. Mirrors the raw-fetch pattern in
// lib/transcription/groq.ts — no extra SDK needed for the NVIDIA path.

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Default to the fast 8B model. The 70B free endpoint routinely queues/cold-
// loads and times out (see prod logs), which dropped every request to the
// static fallback. 8B answers in ~1-3s and rarely queues — real output beats a
// placeholder. Override with NVIDIA_MODEL to trade speed for quality.
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
// Reliability net: if the configured model keeps failing (e.g. someone pins
// NVIDIA_MODEL to the slow 70B that times out on the free tier), we switch to
// this fast model mid-request rather than dropping the user to a placeholder.
const FAST_FALLBACK_NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";

// Paid-tier Claude models (founder decision / W2/B3): Sonnet for Creator, Opus
// for Pro/Studio — the intelligence step-up justifies the higher tier price and
// keeps the Creator→Pro upsell tied to model quality, not just volume. Pinned
// current IDs (aliases resolve to the latest snapshot). Overridable per deploy
// without a code change. A "custom" subscriber's model (Sonnet or Opus, picked
// on the dynamic plan card) overrides this via ChatOptions.aiModel since it
// can't be derived from tier alone.
const ANTHROPIC_MODEL_HAIKU = process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-4-5";
const ANTHROPIC_MODEL_SONNET = process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6";
const ANTHROPIC_MODEL_OPUS = process.env.ANTHROPIC_MODEL_OPUS || "claude-opus-4-8";

const MODEL_ID: Record<AiModel, string> = {
  haiku: ANTHROPIC_MODEL_HAIKU,
  sonnet: ANTHROPIC_MODEL_SONNET,
  opus: ANTHROPIC_MODEL_OPUS,
};

function anthropicModelForTier(tier: AiTier, override?: AiModel): string {
  if (override) return MODEL_ID[override];
  return MODEL_ID[entitlementsFor(tier).model];
}

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

export type ChatUsage = {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ChatResult = {
  text: string;
  provider: ChatProvider;
  /** Token usage for the call (L5 ai_usage). Both providers report it. */
  usage?: ChatUsage;
};

// A tool that forces the Claude path to emit a schema-shaped JSON object via
// tool-use (W2). Far more reliable than "respond ONLY with JSON": the input is
// guaranteed valid JSON, so the quote/control-char/salvage repair stack in
// lib/ai/claude.ts is only needed for the NVIDIA path. The NVIDIA path ignores
// this and uses its OpenAI-style `response_format: json_object` instead.
export type JsonTool = {
  name: string;
  description: string;
  /** JSON Schema object: must be `type: "object"` with `required` +
   *  `additionalProperties: false` so `strict` can guarantee the shape. */
  inputSchema: Record<string, unknown>;
};

export type ChatOptions = {
  system: string;
  user: string;
  maxTokens: number;
  /** Ask the model for a strict JSON object (OpenAI-style response_format). */
  jsonObject?: boolean;
  /** Subscription tier — routes paid users to Claude, free to NVIDIA. Defaults
   *  to "free". */
  tier?: AiTier;
  /** Explicit model override for the Claude path — required for a "custom"
   *  tier caller (their Sonnet/Opus choice can't be derived from tier alone);
   *  ignored for the fixed tiers, which resolve their model from entitlements. */
  aiModel?: AiModel;
  /** When set, the Claude path forces this tool and returns its input as JSON. */
  jsonTool?: JsonTool;
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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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
): Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }> {
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
  return {
    text: stripReasoning(json.choices?.[0]?.message?.content?.trim() ?? ""),
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
  };
}

function nvidiaBody(model: string, opts: ChatOptions): Record<string, unknown> {
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
  return body;
}

async function callNvidia(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  const configured = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;

  const deadline = Date.now() + AI_TOTAL_BUDGET_MS;
  let model = configured;
  let switchedToFast = false;
  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    // Clamp this attempt to whatever time is left in the overall budget.
    const remaining = deadline - Date.now();
    const attemptTimeout = Math.min(AI_TIMEOUT_MS, remaining);
    try {
      const attempt = await nvidiaAttempt(nvidiaBody(model, opts), apiKey, attemptTimeout);
      return {
        text: attempt.text,
        provider: "nvidia",
        usage: { model, inputTokens: attempt.inputTokens, outputTokens: attempt.outputTokens },
      };
    } catch (err) {
      lastError = err;
      // Only transient failures are retried; a 4xx (bad request/auth) throws now.
      if (!(err instanceof RetryableError) || attempt === AI_MAX_RETRIES) {
        throw err;
      }
      // The configured model is failing transiently (usually a timeout on the
      // slow 70B free tier). Rather than burn the remaining retries on it,
      // switch to the fast model immediately — it answers in ~1-3s, so the user
      // still gets real output well within budget instead of a placeholder.
      if (!switchedToFast && model !== FAST_FALLBACK_NVIDIA_MODEL) {
        console.warn(
          `NVIDIA ${model} failed (${err.message}); switching to ${FAST_FALLBACK_NVIDIA_MODEL}`
        );
        model = FAST_FALLBACK_NVIDIA_MODEL;
        switchedToFast = true;
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
  const model = anthropicModelForTier(opts.tier ?? "free", opts.aiModel);

  // Forced tool-use path (W2): the model must call `jsonTool`, and its input is
  // guaranteed to match the schema — so we hand back clean JSON with no repair.
  if (opts.jsonTool) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: [
        {
          name: opts.jsonTool.name,
          description: opts.jsonTool.description,
          input_schema: opts.jsonTool.inputSchema as Anthropic.Tool.InputSchema,
          // Guarantees `tool_use.input` validates exactly against the schema.
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: opts.jsonTool.name },
    });

    const toolUse = response.content.find((item) => item.type === "tool_use");
    const text = toolUse ? JSON.stringify(toolUse.input) : "";
    return { text, provider: "anthropic", usage: anthropicUsage(response) };
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();

  return { text, provider: "anthropic", usage: anthropicUsage(response) };
}

function anthropicUsage(response: Anthropic.Message): ChatUsage {
  return {
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

/**
 * Run a chat completion against the tier-appropriate provider (W2):
 *   - Paid tiers (Creator/Pro/Studio) → Claude, when ANTHROPIC_API_KEY is set.
 *   - Free tier → NVIDIA Llama, when NVIDIA_API_KEY is set.
 * Each falls back to the other provider if its own key is missing, so a
 * single-key deploy still works. Returns null only when NO key is set; throws on
 * API errors so callers can log + fall back to their templated responses.
 */
export async function chat(opts: ChatOptions): Promise<ChatResult | null> {
  const hasNvidia = Boolean(process.env.NVIDIA_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const paid =
    opts.tier === "creator" || opts.tier === "pro" || opts.tier === "studio" || opts.tier === "custom";

  // Paid users get Claude when it's configured; otherwise degrade to NVIDIA.
  if (paid && hasAnthropic) {
    return callAnthropic(opts);
  }
  // Free users (and paid users with no Claude key) get NVIDIA when configured.
  if (hasNvidia) {
    return callNvidia(opts);
  }
  if (hasAnthropic) {
    return callAnthropic(opts);
  }
  return null;
}
