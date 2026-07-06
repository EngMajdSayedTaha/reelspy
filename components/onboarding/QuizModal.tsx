"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ARABIC_DIALECTS, isArabicDialect, type ArabicDialect, type BrandVoice } from "@/lib/ai/brand-voice";
import { completeQuiz, dismissQuiz } from "@/app/dashboard/onboarding/actions";
import { useTour } from "@/components/tour/AppTour";
import { useDict } from "@/lib/i18n/I18nProvider";

type Props = {
  /** Popular niches to offer as one-tap chips (Niche Radar + curated defaults). */
  nicheChips: string[];
  /** Prefill from the user's existing brand_voice — used when re-opened from Settings. */
  initial?: BrandVoice | null;
  /**
   * "onboarding" (default): the one-time, non-dismissable first-login popup —
   * skipping calls dismissQuiz so it never reappears. "edit": opened on demand
   * from Settings to revise answers — closing just closes, no dismissal write.
   */
  mode?: "onboarding" | "edit";
  /** Edit mode only: called after skip/finish so the parent can unmount this. */
  onClose?: () => void;
};

const TOTAL_STEPS = 3;

// One-time onboarding popup (replaces the auto-redirect into the full wizard
// for brand-new users), also reused read-write from Settings (mode="edit") so
// users can revisit and change their answers later. Everything collected here
// feeds profiles.brand_voice, which powers every AI prompt in the app — see
// app/dashboard/onboarding/actions.ts. Only the niche step is required; steps
// 2-3 are skippable via Next. In onboarding mode the whole quiz can only be
// skipped via the "Skip for now" link — not dismissable by clicking outside or
// Escape, since skipping is meant to be an explicit, one-shot choice. Edit mode
// behaves like a normal cancellable dialog instead.
export function QuizModal({ nicheChips, initial, mode = "onboarding", onClose }: Props) {
  const dict = useDict();
  const t = dict.quiz;
  const isEdit = mode === "edit";
  const { startTour } = useTour();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();

  const [niche, setNiche] = useState(initial?.niche ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [offer, setOffer] = useState(initial?.offer ?? "");
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [arabicDialect, setArabicDialect] = useState<ArabicDialect | "">(
    initial?.arabicDialect ?? ""
  );

  const close = () => {
    setOpen(false);
    if (isEdit) {
      onClose?.();
    } else {
      startTour();
    }
  };

  const skip = () => {
    if (pending) return;
    if (isEdit) {
      close();
      return;
    }
    startTransition(async () => {
      await dismissQuiz();
      close();
    });
  };

  const finish = () => {
    startTransition(async () => {
      const result = await completeQuiz({
        niche,
        audience: audience.trim() || null,
        offer: offer.trim() || null,
        tone: tone.trim() || null,
        language: language.trim() || null,
        arabicDialect: isArabicDialect(arabicDialect) ? arabicDialect : null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.savedToast);
      close();
    });
  };

  const canContinueStep1 = niche.trim().length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && skip()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          onEscapeKeyDown={(e) => !isEdit && e.preventDefault()}
          onPointerDownOutside={(e) => !isEdit && e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <div className="mb-5 flex items-center justify-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition ${
                  i + 1 <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {t.step1Title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {t.step1Desc}
                </Dialog.Description>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-niche">{t.nicheLabel}</Label>
                <Input
                  id="quiz-niche"
                  autoFocus
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder={t.nichePlaceholder}
                  maxLength={120}
                />
              </div>
              {nicheChips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {nicheChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setNiche(chip)}
                      className="rounded-full bg-secondary/60 px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {t.step2Title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {t.step2Desc}
                </Dialog.Description>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-audience">{t.audienceLabel}</Label>
                <Textarea
                  id="quiz-audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder={t.audiencePlaceholder}
                  rows={2}
                  maxLength={160}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-offer">{t.offerLabel}</Label>
                <Textarea
                  id="quiz-offer"
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  placeholder={t.offerPlaceholder}
                  rows={2}
                  maxLength={200}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {t.step3Title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {t.step3Desc}
                </Dialog.Description>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quiz-tone">{t.toneLabel}</Label>
                  <Input
                    id="quiz-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder={t.tonePlaceholder}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiz-language">{t.languageLabel}</Label>
                  <Input
                    id="quiz-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder={t.languagePlaceholder}
                    maxLength={60}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-dialect">{t.arabicPresetLabel}</Label>
                <select
                  id="quiz-dialect"
                  aria-label={t.arabicPresetLabel}
                  value={arabicDialect}
                  onChange={(e) => setArabicDialect(e.target.value as ArabicDialect | "")}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">{t.arabicPresetOff}</option>
                  {ARABIC_DIALECTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.labelEn} ({d.labelAr})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            >
              {isEdit ? dict.common.cancel : t.skipForNow}
            </button>
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={pending}
                >
                  {dict.common.back}
                </Button>
              ) : null}
              {step < TOTAL_STEPS ? (
                <Button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={pending || (step === 1 && !canContinueStep1)}
                >
                  {dict.common.next}
                </Button>
              ) : (
                <Button type="button" onClick={finish} disabled={pending || !canContinueStep1}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t.finish}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
