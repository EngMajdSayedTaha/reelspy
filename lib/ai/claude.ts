import Anthropic from "@anthropic-ai/sdk";

export type GeneratedScript = {
  hook: string;
  body: string;
  cta: string;
  viral_pattern: string;
  pattern_explanation?: string;
};

export type GrowthNote = string;

const SCRIPT_SYSTEM_PROMPT = `You are a content script generator for @majdst_codes — a senior full-stack developer from the UAE who makes AI tools, Angular, .NET, and real-world code feel simple and practical for mid-level developers. Aesthetic: dark, terminal, direct, no fluff.

Given an inspiration reel caption and a viral pattern, generate an ORIGINAL script using the SAME pattern structure but through the @majdst_codes lens — your own topic, your own angle, your own voice. Never copy the original content.

Viral patterns you know:
- Hot Take: controversial but defensible statement about code/tools/industry
- Mistake List: common mistakes devs make + the fix
- Tool Reveal: "this tool changed how I [do X]" — specific, practical
- Before/After: before using X vs after — concrete difference
- Story: quick 3-act dev story (problem → struggle → breakthrough)
- Step-by-Step: exact steps to do one specific thing
- Unpopular Opinion: thing everyone does wrong + your take on why

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "hook": "under 15 words. scroll-stopping opener that creates curiosity or controversy",
  "body": "3-5 punchy lines for a 30-60s reel. spoken words, not a blog post. each line standalone",
  "cta": "soft, natural close. not salesy. comment/save/follow if it resonates",
  "viral_pattern": "pattern name used",
  "pattern_explanation": "one sentence explaining why this pattern converts"
}`;

const GROWTH_SYSTEM_PROMPT = `You are a data-driven Instagram growth advisor for @majdst_codes — a senior full-stack developer content creator from the UAE. Analyze the provided post metrics JSON and return exactly 5 specific, actionable growth recommendations.

Each recommendation must:
- Reference actual data patterns from the metrics (timing, content type, engagement rates)
- Be immediately actionable (not generic advice)
- Be specific to a developer/tech content creator audience

Respond ONLY with a JSON array of 5 strings. No markdown, no preamble.`;

type GenerateScriptInput = {
  caption: string;
  viralPattern?: string;
  platform?: string;
  tone?: string;
  customContext?: string;
};

function fallbackScript(input: GenerateScriptInput): GeneratedScript {
  const topic = input.caption.slice(0, 120) || "this idea";
  const pattern = input.viralPattern ?? "Tool Reveal";

  return {
    hook: `This one change saved me hours of ${topic.split(" ").slice(0, 3).join(" ")}.`,
    body: `Most devs skip this. Here's the exact thing that changed how I work.\n\nStep 1: identify the friction point.\nStep 2: replace it with the simpler approach.\nStep 3: never go back.`,
    cta: "Save this if you want the full breakdown.",
    viral_pattern: pattern,
    pattern_explanation:
      "Tool Reveal pattern works because it promises a specific, concrete outcome and creates FOMO around a known problem.",
  };
}

function parseJsonFromText(text: string): GeneratedScript | null {
  try {
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(clean) as Partial<GeneratedScript>;
    if (!parsed.hook || !parsed.body || !parsed.cta || !parsed.viral_pattern) {
      return null;
    }
    return {
      hook: parsed.hook,
      body: parsed.body,
      cta: parsed.cta,
      viral_pattern: parsed.viral_pattern,
      pattern_explanation: parsed.pattern_explanation,
    };
  } catch {
    return null;
  }
}

export async function generateScript(input: GenerateScriptInput): Promise<GeneratedScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackScript(input);
  }

  const anthropic = new Anthropic({ apiKey });

  const userMessage = [
    `Caption: ${input.caption}`,
    `Pattern: ${input.viralPattern ?? "Tool Reveal"}`,
    `Platform: ${input.platform ?? "Instagram Reels"}`,
    `Tone: ${input.tone ?? "Direct"}`,
    input.customContext ? `Extra context: ${input.customContext}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: SCRIPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();

    return parseJsonFromText(text) ?? fallbackScript(input);
  } catch (error) {
    console.error("Claude script generation failed", error);
    return fallbackScript(input);
  }
}

export async function generateGrowthNotes(metricsJson: string): Promise<GrowthNote[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return [
      "Connect your Anthropic API key to get AI-powered growth recommendations.",
      "Track 20+ reels before generating notes — more data means better insights.",
      "Post consistently for 2-3 weeks to establish baseline engagement patterns.",
      "Reels posted at 7–9 PM typically see higher reach — test this window.",
      "Hook the first 1-2 seconds with a visual or bold text on screen.",
    ];
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: GROWTH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze these Instagram post metrics and give 5 specific recommendations:\n\n${metricsJson}`,
        },
      ],
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();

    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(clean) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed as GrowthNote[];
    }

    throw new Error("Invalid response format");
  } catch (error) {
    console.error("Claude growth notes failed", error);
    return [
      "Could not generate AI notes — check your Anthropic API key.",
      "Make sure you have recent media data synced from Instagram.",
    ];
  }
}
