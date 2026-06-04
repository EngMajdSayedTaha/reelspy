"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type AddAccountFormProps = {
  action: ActionFn;
};

export function AddAccountForm({ action }: AddAccountFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="ig_username">Instagram Username</Label>
          <Input
            id="ig_username"
            name="ig_username"
            placeholder="example_creator"
            required
            disabled={isPending}
          />
        </div>

        <Button type="submit" className="md:min-w-[140px]" disabled={isPending}>
          {isPending ? "Adding..." : "Add Account"}
        </Button>
      </div>

      {state.error ? (
        <p className="mt-3 text-sm text-rose-400">{state.error}</p>
      ) : null}
    </form>
  );
}
