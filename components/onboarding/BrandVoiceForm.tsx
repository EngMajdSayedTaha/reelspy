"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ARABIC_DIALECTS, type BrandVoice } from "@/lib/ai/brand-voice";
import type { OnboardingActionState } from "@/app/dashboard/onboarding/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

type SaveFn = (prev: OnboardingActionState, formData: FormData) => Promise<OnboardingActionState>;

type Props = {
  action: SaveFn;
  initial?: BrandVoice | null;
  /** Label for the submit button (wizard says "Save & continue"; settings "Save"). */
  submitLabel?: string;
  /** When set, navigate here on success (wizard advances a step); else refresh. */
  onSuccessHref?: string;
};

// Collects the per-user brand voice that de-personas the AI (B2). Used in the
// onboarding wizard and reusable anywhere the voice is edited.
export function BrandVoiceForm({ action, initial, submitLabel, onSuccessHref }: Props) {
  const dict = useDict();
  const o = dict.onboarding;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const finalSubmitLabel = submitLabel ?? o.saveAndContinue;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action({}, formData);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(o.brandVoiceSaved);
        // Server action revalidated. Navigate on if the caller wants the wizard
        // to advance; otherwise just refresh in place (e.g. Settings).
        if (onSuccessHref) router.push(onSuccessHref);
        else router.refresh();
      } catch {
        setError(o.couldNotSave);
        toast.error(o.couldNotSave);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="niche">{o.nicheQuestion}</Label>
        <Input
          id="niche"
          name="niche"
          placeholder={o.nichePlaceholder}
          defaultValue={initial?.niche ?? ""}
          disabled={isPending}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience">{o.audienceQuestion}</Label>
        <Input
          id="audience"
          name="audience"
          placeholder={o.audiencePlaceholder}
          defaultValue={initial?.audience ?? ""}
          disabled={isPending}
          maxLength={160}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="offer">
          {o.offerLabel} <span className="text-muted-foreground">({dict.common.optional})</span>
        </Label>
        <Textarea
          id="offer"
          name="offer"
          rows={2}
          placeholder={o.offerPlaceholder}
          defaultValue={initial?.offer ?? ""}
          disabled={isPending}
          maxLength={200}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tone">
            {o.voiceToneLabel} <span className="text-muted-foreground">({dict.common.optional})</span>
          </Label>
          <Input
            id="tone"
            name="tone"
            placeholder={o.voiceTonePlaceholder}
            defaultValue={initial?.tone ?? ""}
            disabled={isPending}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language">
            {o.languageLabel} <span className="text-muted-foreground">({dict.common.optional})</span>
          </Label>
          <Input
            id="language"
            name="language"
            placeholder={o.languagePlaceholder}
            defaultValue={initial?.language ?? ""}
            disabled={isPending}
            maxLength={60}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="arabicDialect">
          {o.arabicPresetLabel} <span className="text-muted-foreground">({dict.common.optional})</span>
        </Label>
        <Select
          id="arabicDialect"
          name="arabicDialect"
          aria-label={o.arabicPresetLabel}
          defaultValue={initial?.arabicDialect ?? ""}
          disabled={isPending}
          className="w-full px-3 disabled:opacity-60"
        >
          <option value="">{o.arabicPresetOff}</option>
          {/* Structured Arabic-dialect preset (X2) — labels intentionally show
              both the English name and the Arabic script regardless of UI
              locale, so a user can identify the dialect either way. */}
          {ARABIC_DIALECTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.labelEn} ({d.labelAr})
            </option>
          ))}
        </Select>
        <p className="text-xs text-subtle">{o.arabicPresetHint}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? dict.common.saving : finalSubmitLabel}
      </Button>
    </form>
  );
}
