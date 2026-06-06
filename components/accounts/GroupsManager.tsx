"use client";

import { useActionState } from "react";
import { FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Group = { id: string; name: string };

type ActionState = { error?: string };
type CreateFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;
type DeleteFn = (formData: FormData) => Promise<void>;

type GroupsManagerProps = {
  groups: Group[];
  createAction: CreateFn;
  deleteAction: DeleteFn;
};

export function GroupsManager({ groups, createAction, deleteAction }: GroupsManagerProps) {
  const [state, formAction, isPending] = useActionState(createAction, {});

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
      <div className="flex items-center gap-2">
        <FolderPlus className="h-4 w-4 text-[#F9E400]" />
        <p className="font-medium text-zinc-100">Groups</p>
        <span className="text-xs text-zinc-500">Organize accounts (e.g. Angular, Memes)</span>
      </div>

      <form action={formAction} className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Input name="name" placeholder="New group name…" required disabled={isPending} maxLength={40} />
        <Button type="submit" variant="default" className="md:min-w-[120px]" disabled={isPending}>
          {isPending ? "Adding…" : "Add Group"}
        </Button>
      </form>

      {state.error ? <p className="mt-2 text-sm text-rose-400">{state.error}</p> : null}

      {groups.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {groups.map((group) => (
            <span
              key={group.id}
              className="flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#141414] py-1 pl-3 pr-1.5 text-sm text-zinc-200"
            >
              {group.name}
              <form action={deleteAction}>
                <input type="hidden" name="group_id" value={group.id} />
                <button
                  type="submit"
                  aria-label={`Delete group ${group.name}`}
                  title="Delete group"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No groups yet. Create one above, then assign accounts.</p>
      )}
    </div>
  );
}
