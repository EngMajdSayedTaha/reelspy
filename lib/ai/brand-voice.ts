// Brand-voice types + Arabic presets (roadmap L1/B2 + X2). Kept dependency-free
// (no AI SDK / provider imports) so CLIENT components — e.g. BrandVoiceForm — can
// import the runtime constants without pulling the Anthropic SDK into the browser
// bundle. `claude.ts` (server) re-exports these and consumes them in the prompts.

// Arabic-first script presets (X2). A structured toggle (separate from the
// free-text `language` field) that forces the script's output language +
// dialect. Gulf/Khaleeji for GCC-native colloquial, MSA (الفصحى) for pan-Arab
// formal. Unset → language is inferred from `language`/the reel as before.
export type ArabicDialect = "gulf" | "msa";

export const ARABIC_DIALECTS: { value: ArabicDialect; labelEn: string; labelAr: string }[] = [
  { value: "gulf", labelEn: "Gulf / Khaleeji", labelAr: "خليجي" },
  { value: "msa", labelEn: "Modern Standard Arabic", labelAr: "الفصحى" },
];

export function isArabicDialect(value: unknown): value is ArabicDialect {
  return value === "gulf" || value === "msa";
}

// Per-user brand voice (profiles.brand_voice). Interpolated into the AI system
// prompts so every creator's scripts/notes speak in THEIR voice — this is what
// makes the product safe to sell to anyone but the founder. All fields optional;
// collected during onboarding (B3). When absent the prompts fall back to a
// neutral creator persona rather than the old hardcoded @majdst_codes one.
export type BrandVoice = {
  creator?: string | null;
  niche?: string | null;
  audience?: string | null;
  offer?: string | null;
  tone?: string | null;
  language?: string | null;
  arabicDialect?: ArabicDialect | null;
};
