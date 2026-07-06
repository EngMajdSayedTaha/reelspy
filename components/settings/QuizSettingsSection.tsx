"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { QuizModal } from "@/components/onboarding/QuizModal";
import type { BrandVoice } from "@/lib/ai/brand-voice";
import { useDict } from "@/lib/i18n/I18nProvider";

// Lets a user re-open the onboarding quiz (components/onboarding/QuizModal.tsx)
// at any time to revise their niche/audience/offer/tone/language, even after
// they've already completed or skipped it once. Submitting goes through the
// same completeQuiz action, which recomputes niche_slug — so account
// suggestions (lib/suggestions/accounts.ts) refresh from the new answers.
export function QuizSettingsSection({
  brandVoice,
  nicheChips,
}: {
  brandVoice: BrandVoice | null;
  nicheChips: string[];
}) {
  const dict = useDict();
  const t = dict.settings.quiz;
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
            <Sparkles className="h-5 w-5 text-brand" />
          </span>
          <div>
            <p className="font-semibold text-foreground">{t.title}</p>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          {t.button}
        </button>
      </div>

      {editing ? (
        <QuizModal
          nicheChips={nicheChips}
          mode="edit"
          initial={brandVoice}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
