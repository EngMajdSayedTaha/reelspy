"use client";

import { useRef, useState, useTransition } from "react";
import { FolderPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useDict } from "@/lib/i18n/I18nProvider";

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
  const fullDict = useDict();
  const dict = fullDict.accounts.groups;
  const commonDelete = fullDict.common.delete;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name);
  const [synced, setSynced] = useState(group.name);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);
  const confirm = useConfirm();

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
      toast.error(dict.nameExistsError);
      return;
    }
    savedRef.current = true;
    setEditing(false);
    const data = new FormData();
    data.set("group_id", group.id);
    data.set("name", name);
    startTransition(async () => {
      try {
        await renameAction(data);
        toast.success(dict.renamedToast);
      } catch {
        setValue(group.name);
        toast.error(dict.renameError);
      }
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: dict.deleteConfirmTitle(group.name),
      description: dict.deleteConfirmDesc,
      confirmText: commonDelete,
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("group_id", group.id);
    startTransition(async () => {
      try {
        await deleteAction(data);
        toast.success(dict.deletedToast(group.name));
      } catch {
        toast.error(dict.deleteError);
      }
    });
  };

  if (editing) {
    return (
      <span className="flex items-center rounded-full border border-primary/40 bg-surface-2 py-0.5 ps-2 pe-1">
        <input
          ref={inputRef}
          value={value}
          maxLength={40}
          disabled={isPending}
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
          className="w-28 bg-transparent text-base md:text-sm text-foreground outline-none"
        />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 py-1 ps-3 pe-1.5 text-sm text-foreground">
      <button
        type="button"
        onClick={startEdit}
        disabled={isPending}
        title={dict.renameHint}
        className="transition hover:text-accent-brand disabled:opacity-60"
      >
        {group.name}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        aria-label={dict.deleteAria(group.name)}
        title={dict.deleteTitle}
        className="flex h-5 w-5 items-center justify-center rounded-full text-subtle transition hover:bg-danger/15 hover:text-danger disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function GroupsManager({ groups, createAction, deleteAction, renameAction }: GroupsManagerProps) {
  const fullDict = useDict();
  const dict = fullDict.accounts.groups;
  const commonSaving = fullDict.common.saving;
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(dict.enterNameError);
      return;
    }
    const data = new FormData();
    data.set("name", trimmed);
    startTransition(async () => {
      try {
        const result = await createAction({}, data);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setName("");
        toast.success(dict.createdToast(trimmed));
      } catch {
        toast.error(dict.createError);
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <FolderPlus className="h-4 w-4 text-brand" />
        <p className="font-medium text-foreground">{dict.heading}</p>
        <span className="text-xs text-subtle">{dict.hint}</span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          placeholder={dict.newGroupPlaceholder}
          disabled={isPending}
          maxLength={40}
        />
        <Button
          type="button"
          variant="default"
          className="md:min-w-[120px]"
          onClick={create}
          disabled={isPending}
        >
          {isPending ? commonSaving : dict.addGroup}
        </Button>
      </div>

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
        <p className="mt-3 text-sm text-subtle">{dict.noGroupsYet}</p>
      )}
    </div>
  );
}
