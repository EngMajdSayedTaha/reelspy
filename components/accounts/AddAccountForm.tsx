"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type AddAccountFormProps = {
  action: ActionFn;
};

export function AddAccountForm({ action }: AddAccountFormProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const handle = username.trim().replace(/^@+/, "");
    if (!handle) {
      setError("Instagram username is required.");
      return;
    }
    setError(null);

    const data = new FormData();
    data.set("ig_username", handle);

    startTransition(async () => {
      try {
        const result = await action({}, data);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setUsername("");
        toast.success(`Added @${handle.toLowerCase()}`);
      } catch {
        const message = "Could not add the account. Please try again.";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="ig_username">Instagram Username</Label>
          <Input
            id="ig_username"
            name="ig_username"
            placeholder="example_creator"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            disabled={isPending}
          />
        </div>

        <Button
          type="button"
          className="md:min-w-[140px]"
          onClick={submit}
          disabled={isPending}
        >
          {isPending ? "Adding..." : "Add Account"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
