"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ARABIC_DIALECTS, isArabicDialect, type ArabicDialect, type BrandVoice } from "@/lib/ai/brand-voice";
import {
  completeQuiz,
  dismissQuiz,
  getQuizSuggestions,
  seedStarterPack,
  type QuizSuggestion,
} from "@/app/dashboard/onboarding/actions";
import { bulkAddInspirationAccounts } from "@/app/dashboard/accounts/actions";
import { ChipGroup } from "@/components/onboarding/ChipGroup";
import { useDict } from "@/lib/i18n/I18nProvider";

function compactFollowers(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

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

// Edit mode never sees step 4 (it revises answers, it doesn't onboard) — the
// quiz simply saves and closes after the tone/language step.
const LAST_INPUT_STEP = 3;

// One-time onboarding popup (replaces the auto-redirect into the full wizard
// for brand-new users), also reused read-write from Settings (mode="edit") so
// users can revisit and change their answers later. Everything collected here
// feeds profiles.brand_voice, which powers every AI prompt in the app — see
// app/dashboard/onboarding/actions.ts. Only the niche step is required; steps
// 2-3 are skippable via Next. In onboarding mode the whole quiz can only be
// skipped via the "Skip for now" link — not dismissable by clicking outside or
// Escape, since skipping is meant to be an explicit, one-shot choice. Edit mode
// behaves like a normal cancellable dialog instead. Onboarding mode gets a 4th
// step after Finish — real niche-matched accounts to track immediately, the
// fastest path to a populated feed (see getQuizSuggestions).
export function QuizModal({ nicheChips, initial, mode = "onboarding", onClose }: Props) {
  const dict = useDict();
  const t = dict.quiz;
  const router = useRouter();
  const isEdit = mode === "edit";
  const TOTAL_STEPS = isEdit ? 3 : 4;
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();

  const [niche, setNiche] = useState(initial?.niche ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [offer, setOffer] = useState(initial?.offer ?? "");
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [toneChipsSelected, setToneChipsSelected] = useState<string[]>([]);
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [arabicDialect, setArabicDialect] = useState<ArabicDialect | "">(
    initial?.arabicDialect ?? ""
  );

  const [step4Kind, setStep4Kind] = useState<"ready" | "empty" | "cap" | null>(null);
  const [capMessage, setCapMessage] = useState("");
  const [suggestedAccounts, setSuggestedAccounts] = useState<QuizSuggestion[]>([]);
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  const close = () => {
    setOpen(false);
    if (isEdit) onClose?.();
  };

  const combinedTone = () => [...toneChipsSelected, tone.trim()].filter(Boolean).join(", ").slice(0, 120);

  const showArabicDialect = [t.languageChips[1], t.languageChips[2]]
    .map((s) => s.toLowerCase())
    .includes(language.trim().toLowerCase());

  const buildAnswers = () => ({
    niche: niche.trim(),
    audience: audience.trim() || null,
    offer: offer.trim() || null,
    tone: combinedTone() || null,
    language: language.trim() || null,
    arabicDialect: showArabicDialect && isArabicDialect(arabicDialect) ? arabicDialect : null,
  });

  // Skipping with a niche already typed still saves it (completeQuiz merges
  // partials) — only a genuinely blank quiz is a true dismissal. Either way the
  // popup is permanently gone: dismissQuiz/completeQuiz both stamp
  // quiz_completed_at, so it never reappears. On step 4 the quiz is already
  // saved (Finish already ran completeQuiz) — skipping there just closes.
  const skip = () => {
    if (pending) return;
    if (isEdit || step === 4) {
      close();
      return;
    }
    const hasNiche = niche.trim().length > 0;
    startTransition(async () => {
      if (hasNiche) {
        await completeQuiz(buildAnswers());
      } else {
        await dismissQuiz();
      }
      close();
    });
  };

  const finish = () => {
    startTransition(async () => {
      const result = await completeQuiz(buildAnswers());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.savedToast);
      if (isEdit) {
        close();
        return;
      }

      // Onboarding mode hands off to step 4 instead of closing — surface real
      // niche-matched accounts (now resolvable since niche_slug was just set)
      // as the fastest path to a populated feed.
      setStep(4);
      const suggestions = await getQuizSuggestions();
      if (suggestions.capMessage) {
        setCapMessage(suggestions.capMessage);
        setStep4Kind("cap");
      } else if (suggestions.accounts.length === 0) {
        setStep4Kind("empty");
      } else {
        setSuggestedAccounts(suggestions.accounts);
        setSelectedUsernames(new Set(suggestions.accounts.map((a) => a.igUsername)));
        setStep4Kind("ready");
      }
    });
  };

  const toggleSelectedAccount = (username: string) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  const trackSelectedAccounts = () => {
    if (selectedUsernames.size === 0) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("usernames", [...selectedUsernames].join(","));
      try {
        const res = await bulkAddInspirationAccounts({}, data);
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(t.addedToast(res.added ?? 0));
        }
      } catch {
        // Non-blocking: brand voice + niche are already saved regardless of
        // whether the tracking call itself succeeded.
      }
      router.refresh();
      close();
    });
  };

  const goStarterPack = () => {
    startTransition(async () => {
      const res = await seedStarterPack();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(dict.onboarding.addedStarterAccounts(res.added ?? 0));
      }
      router.refresh();
      close();
    });
  };

  const canContinueStep1 = niche.trim().length > 0;
  const skipLabel = isEdit ? dict.common.cancel : canContinueStep1 ? t.saveAndClose : t.skipForNow;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && skip()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          onEscapeKeyDown={(e) => !isEdit && e.preventDefault()}
          onPointerDownOutside={(e) => !isEdit && e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <div
            className="mb-2 flex items-center justify-center gap-1.5"
            role="group"
            aria-label={t.stepCounter(step, TOTAL_STEPS)}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition ${
                  i + 1 === step ? "bg-primary" : i + 1 < step ? "bg-primary/50" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className="mb-3 text-center text-xs text-subtle">{t.stepCounter(step, TOTAL_STEPS)}</p>

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
              {nicheChips.length > 0 ? (
                <div className="space-y-2">
                  <Label>{t.nicheLabel}</Label>
                  <ChipGroup
                    options={nicheChips}
                    selected={niche.trim() ? [niche.trim()] : []}
                    onToggle={(chip) =>
                      setNiche((prev) => (prev.trim().toLowerCase() === chip.toLowerCase() ? "" : chip))
                    }
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="quiz-niche">{nicheChips.length > 0 ? t.orTypeYourOwn : t.nicheLabel}</Label>
                <Input
                  id="quiz-niche"
                  autoFocus={nicheChips.length === 0}
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder={t.nichePlaceholder}
                  maxLength={120}
                />
              </div>
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
                <p className="mt-1 text-xs text-subtle">{t.skipAnytimeHint}</p>
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
                <p className="mt-1 text-xs text-subtle">{t.skipAnytimeHint}</p>
              </div>

              <div className="space-y-2">
                <Label>{t.toneLabel}</Label>
                <ChipGroup
                  multi
                  options={t.toneChips}
                  selected={toneChipsSelected}
                  onToggle={(chip) =>
                    setToneChipsSelected((prev) =>
                      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
                    )
                  }
                />
                <Label htmlFor="quiz-tone" className="text-xs font-normal text-subtle">
                  {t.orTypeYourOwn}
                </Label>
                <Input
                  id="quiz-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder={t.tonePlaceholder}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label>{t.languageLabel}</Label>
                <ChipGroup
                  options={t.languageChips}
                  selected={language.trim() ? [language.trim()] : []}
                  onToggle={(chip) =>
                    setLanguage((prev) => (prev.trim().toLowerCase() === chip.toLowerCase() ? "" : chip))
                  }
                />
                <Label htmlFor="quiz-language" className="text-xs font-normal text-subtle">
                  {t.orTypeYourOwn}
                </Label>
                <Input
                  id="quiz-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder={t.languagePlaceholder}
                  maxLength={60}
                />
              </div>

              {showArabicDialect ? (
                <div className="space-y-2">
                  <Label htmlFor="quiz-dialect">{t.arabicPresetLabel}</Label>
                  <Select
                    id="quiz-dialect"
                    aria-label={t.arabicPresetLabel}
                    value={arabicDialect}
                    onChange={(e) => setArabicDialect(e.target.value as ArabicDialect | "")}
                    className="w-full px-3"
                  >
                    <option value="">{t.arabicPresetOff}</option>
                    {ARABIC_DIALECTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.labelEn} ({d.labelAr})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {t.step4Title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {t.step4Desc}
                </Dialog.Description>
              </div>

              {step4Kind === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
                  ))}
                </div>
              ) : step4Kind === "cap" ? (
                <div className="space-y-2 rounded-xl border border-dashed border-border-strong bg-background p-4 text-sm text-muted-foreground">
                  <p>{capMessage}</p>
                  <Link href="/dashboard/billing" onClick={close} className="font-medium text-accent-brand hover:underline">
                    {dict.billing.upgrade}
                  </Link>
                </div>
              ) : step4Kind === "empty" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t.step4Empty}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" onClick={goStarterPack} disabled={pending}>
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {dict.onboarding.skipUseStarterPack}
                    </Button>
                    <Link
                      href="/dashboard/onboarding?step=3"
                      onClick={close}
                      className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {t.step4AddOwn}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {suggestedAccounts.map((account) => (
                      <label
                        key={account.igUsername}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition hover:border-border-strong"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsernames.has(account.igUsername)}
                          onChange={() => toggleSelectedAccount(account.igUsername)}
                          className="h-4 w-4 shrink-0 rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/40"
                        />
                        {account.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={account.avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                            {account.igUsername.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            @{account.igUsername}
                          </p>
                          <p className="text-xs text-subtle">
                            {compactFollowers(account.followers)} {t.step4Followers}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={trackSelectedAccounts}
                    disabled={pending || selectedUsernames.size === 0}
                    className="w-full"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t.step4Cta(selectedUsernames.size)}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            >
              {skipLabel}
            </button>
            {step <= LAST_INPUT_STEP ? (
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
                {step < LAST_INPUT_STEP ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={pending || (step === 1 && !canContinueStep1)}
                  >
                    {dict.common.next}
                  </Button>
                ) : (
                  <Button type="button" onClick={finish} disabled={pending || !canContinueStep1}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t.finishCta}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
