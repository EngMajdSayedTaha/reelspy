import Link from "next/link";
import { cookies } from "next/headers";
import { Check, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinishButton } from "@/components/onboarding/OnboardingControls";
import type { OnboardingState } from "@/lib/onboarding/state";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary, type Dict } from "@/lib/i18n/dictionaries";

// Persistent "finish setup" card for the dashboard home, shown until the user
// activates (writes a first script) or dismisses. Mirrors the wizard's four
// steps so progress is visible at a glance. Server component — display only,
// but each unfinished row is itself a deep link into its wizard step so the
// card doubles as a launcher, not just a status readout.
function items(
  dict: Dict["onboarding"]
): { key: keyof OnboardingState["steps"]; label: string; step: 1 | 2 | 3 | 4 }[] {
  return [
    { key: "source", label: dict.checklistConnectOrStarter, step: 1 },
    { key: "brandVoice", label: dict.checklistSetBrandVoice, step: 2 },
    { key: "accounts", label: dict.checklistTrackAccounts, step: 3 },
    { key: "firstScript", label: dict.step4Title, step: 4 },
  ];
}

export async function SetupChecklist({ state }: { state: OnboardingState }) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).onboarding;
  const pct = Math.round((state.completedCount / 4) * 100);
  const remainingSteps = 4 - state.completedCount;

  return (
    <div data-tour="setup-checklist" className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{dict.finishSettingUp}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dict.progressLine(state.completedCount, pct)}
            {remainingSteps > 0 ? ` ${dict.checklistTimeLeft(remainingSteps * 3)}` : ""}
          </p>
        </div>
        <FinishButton href="/dashboard" label={dict.dismiss} variant="ghost" />
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {items(dict).map((item) => {
          const done = state.steps[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
              {done ? (
                <span className="text-muted-foreground line-through">{item.label}</span>
              ) : (
                <Link
                  href={`/dashboard/onboarding?step=${item.step}`}
                  className="group/step flex items-center gap-1 text-foreground hover:text-accent-brand"
                >
                  {item.label}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition group-hover/step:translate-x-0.5 group-hover/step:opacity-100 rtl:rotate-180 rtl:group-hover/step:-translate-x-0.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <Button asChild>
          <Link href={`/dashboard/onboarding?step=${state.currentStep}`}>
            {dict.nextStepCta(state.currentStep)} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
