"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BrandVoice } from "@/lib/ai/claude";
import type { OnboardingActionState } from "@/app/dashboard/onboarding/actions";

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
export function BrandVoiceForm({ action, initial, submitLabel = "Save & continue", onSuccessHref }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        toast.success("Brand voice saved");
        // Server action revalidated. Navigate on if the caller wants the wizard
        // to advance; otherwise just refresh in place (e.g. Settings).
        if (onSuccessHref) router.push(onSuccessHref);
        else router.refresh();
      } catch {
        const message = "Could not save. Please try again.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="niche">What&apos;s your niche or topic?</Label>
        <Input
          id="niche"
          name="niche"
          placeholder="e.g. real-estate lead-gen for Dubai agents"
          defaultValue={initial?.niche ?? ""}
          disabled={isPending}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience">Who are you talking to?</Label>
        <Input
          id="audience"
          name="audience"
          placeholder="e.g. solo agents and small brokerages in the UAE"
          defaultValue={initial?.audience ?? ""}
          disabled={isPending}
          maxLength={160}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="offer">
          Your offer or point of view <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="offer"
          name="offer"
          rows={2}
          placeholder="e.g. I help agents close more listings with short-form video"
          defaultValue={initial?.offer ?? ""}
          disabled={isPending}
          maxLength={200}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tone">
            Voice &amp; tone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="tone"
            name="tone"
            placeholder="e.g. direct, no fluff, a bit witty"
            defaultValue={initial?.tone ?? ""}
            disabled={isPending}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language">
            Primary language <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="language"
            name="language"
            placeholder="e.g. English, or English + Arabic hooks"
            defaultValue={initial?.language ?? ""}
            disabled={isPending}
            maxLength={60}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
