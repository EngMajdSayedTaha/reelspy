import Anthropic from "@anthropic-ai/sdk";

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

async function callNvidia(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  const model = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens,
    temperature: 0.7,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.jsonObject) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(NVIDIA_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`NVIDIA chat failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await response.json()) as OpenAiChatResponse;
  const text = stripReasoning(json.choices?.[0]?.message?.content?.trim() ?? "");

  return { text, provider: "nvidia" };
}

async function callAnthropic(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const anthropic = new Anthropic({ apiKey });

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
