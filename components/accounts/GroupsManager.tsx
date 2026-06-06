"use client";

import { useActionState, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Group = { id: string; name: string };

type ActionState = { error?: string };
type CreateFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;
type DeleteFn = (formData: FormData) => Promise<void>;
type RenameFn = (formData: FormData) => Promise<void>;

type GroupsManagerProps = {
  groups: Group[];
  createAction: CreateFn;
  deleteAction: DeleteFn;
  renameAction: RenameFn;
};

function GroupChip({
  group,
  otherNames,
  deleteAction,
  renameAction,
}: {
  group: Group;
  otherNames: string[];
  deleteAction: DeleteFn;
  renameAction: RenameFn;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name);
  const [synced, setSynced] = useState(group.name);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);

  // Keep local value in sync when the saved name changes (after revalidation).
  if (group.name !== synced) {
    setSynced(group.name);
    setValue(group.name);
  }

  const startEdit = () => {
    savedRef.current = false;
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    setValue(group.name);
    setEditing(false);
  };

  const commit = () => {
    if (savedRef.current) return;
    const name = value.trim();
    if (!name || name === group.name) {
      cancel();
      return;
    }
    if (otherNames.includes(name.toLowerCase())) {
      toast.error("A group with that name already exists.");
      return;
    }
    savedRef.current = true;
    formRef.current?.requestSubmit();
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        ref={formRef}
        action={renameAction}
        className="flex items-center rounded-full border border-[#F9E400]/40 bg-[#141414] py-0.5 pl-2 pr-1"
      >
        <input type="hidden" name="group_id" value={group.id} />
        <input
          ref={inputRef}
          name="name"
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="w-28 bg-transparent text-sm text-zinc-100 outline-none"
        />
      </form>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#141414] py-1 pl-3 pr-1.5 text-sm text-zinc-200">
      <button
        type="button"
        onClick={startEdit}
        title="Click to rename"
        className="transition hover:text-[#F9E400]"
      >
        {group.name}
      </button>
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
  );
}

export function GroupsManager({ groups, createAction, deleteAction, renameAction }: GroupsManagerProps) {
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
            <GroupChip
              key={group.id}
              group={group}
              otherNames={groups
                .filter((g) => g.id !== group.id)
                .map((g) => g.name.toLowerCase())}
              deleteAction={deleteAction}
              renameAction={renameAction}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No groups yet. Create one above, then assign accounts.</p>
      )}
    </div>
  );
}
