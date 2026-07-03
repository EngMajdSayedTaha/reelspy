import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinishButton } from "@/components/onboarding/OnboardingControls";
import type { OnboardingState } from "@/lib/onboarding/state";

// Persistent "finish setup" card for the dashboard home, shown until the user
// activates (writes a first script) or dismisses. Mirrors the wizard's four
// steps so progress is visible at a glance. Server component — display only.
const ITEMS: { key: keyof OnboardingState["steps"]; label: string }[] = [
  { key: "source", label: "Connect Instagram or add a starter pack" },
  { key: "brandVoice", label: "Set your brand voice" },
  { key: "accounts", label: "Track a few accounts" },
  { key: "firstScript", label: "Write your first script" },
];

export function SetupChecklist({ state }: { state: OnboardingState }) {
  const pct = Math.round((state.completedCount / 4) * 100);

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Finish setting up ReelSpy</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {state.completedCount} of 4 done — you&apos;re {pct}% of the way to your first script.
          </p>
        </div>
        <FinishButton href="/dashboard" label="Dismiss" variant="ghost" />
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {ITEMS.map((item) => {
          const done = state.steps[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
              <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <Button asChild>
          <Link href={`/dashboard/onboarding?step=${state.currentStep}`}>
            Continue setup <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
