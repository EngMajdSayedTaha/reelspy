"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDict } from "@/lib/i18n/I18nProvider";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type Group = { id: string; name: string };

type AddAccountFormProps = {
  action: ActionFn;
  groups: Group[];
};

export function AddAccountForm({ action, groups }: AddAccountFormProps) {
  const dict = useDict().accounts;
  const [username, setUsername] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const handle = username.trim().replace(/^@+/, "");
    if (!handle) {
      setError(dict.actions.usernameRequired);
      return;
    }
    setError(null);

    const data = new FormData();
    data.set("ig_username", handle);
    if (groupId) data.set("group_id", groupId);

    startTransition(async () => {
      try {
        const result = await action({}, data);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setUsername("");
        const groupName = groups.find((g) => g.id === groupId)?.name;
        toast.success(
          groupName
            ? dict.addForm.addedToGroupToast(handle.toLowerCase(), groupName)
            : dict.addForm.addedToast(handle.toLowerCase())
        );
      } catch {
        const message = dict.addForm.addFailedToast;
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="ig_username">{dict.addForm.usernameLabel}</Label>
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

        {groups.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="add_group">{dict.addForm.groupLabel}</Label>
            <select
              id="add_group"
              aria-label={dict.addForm.groupSelectAria}
              value={groupId}
              disabled={isPending}
              onChange={(e) => setGroupId(e.target.value)}
              className="block h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60 md:w-44"
            >
              <option value="">{dict.noGroupOption}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <Button
          type="button"
          className="md:min-w-[140px]"
          onClick={submit}
          disabled={isPending}
        >
          {isPending ? dict.addForm.adding : dict.addForm.addButton}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
