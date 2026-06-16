"use client";

import { useRef, useState, useTransition } from "react";
import { CheckSquare, ChevronDown, Square, Upload, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BulkAddState } from "@/app/dashboard/accounts/actions";

type Group = { id: string; name: string };

type ImportFollowingProps = {
  groups: Group[];
  bulkAddAction: (prevState: BulkAddState, formData: FormData) => Promise<BulkAddState>;
};

const USERNAME_RE = /^[a-z0-9._]{1,30}$/i;

// Pulls usernames out of whatever the user gives us:
//  - a plain paste ("@user1, user2 user3")
//  - Instagram's data-export following.json ({"relationships_following": [...]})
//  - Instagram's data-export following.html (profile links)
function extractUsernames(raw: string): string[] {
  const found = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const u = value.trim().replace(/^@+/, "").toLowerCase();
    if (u && USERNAME_RE.test(u)) found.add(u);
  };

  const trimmed = raw.trim();

  // JSON export
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      const walk = (node: unknown) => {
        if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === "object") {
          const record = node as Record<string, unknown>;
          // Export shape: { string_list_data: [{ value, href }] }
          if (typeof record.value === "string") add(record.value);
          if (typeof record.href === "string") {
            const m = /instagram\.com\/([a-z0-9._]{1,30})/i.exec(record.href);
            if (m) add(m[1]);
          }
          Object.values(record).forEach(walk);
        }
      };
      walk(json);
      if (found.size > 0) return Array.from(found);
    } catch {
      // fall through to the generic parsers
    }
  }

  // HTML export — harvest instagram.com profile links
  for (const m of raw.matchAll(/instagram\.com\/([a-z0-9._]{1,30})/gi)) {
    add(m[1]);
  }
  if (found.size > 0) return Array.from(found);

  // Plain paste
  raw.split(/[\s,;]+/).forEach(add);
  return Array.from(found);
}

export function ImportFollowing({ groups, bulkAddAction }: ImportFollowingProps) {
  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (text: string) => {
    const usernames = extractUsernames(text);
    if (usernames.length === 0) {
      toast.error("No Instagram usernames found in that input.");
      return;
    }
    setCandidates(usernames.sort());
    setExcluded(new Set());
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      parse(text);
    } catch {
      toast.error("Could not read that file.");
    }
  };

  const toggle = (username: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  const selected = (candidates ?? []).filter((u) => !excluded.has(u));

  const submit = () => {
    if (selected.length === 0) {
      toast.error("Select at least one account.");
      return;
    }
    const data = new FormData();
    data.set("usernames", selected.join("\n"));
    if (groupId) data.set("group_id", groupId);

    startTransition(async () => {
      try {
        const result = await bulkAddAction({}, data);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        const parts = [`Added ${result.added ?? 0} account${(result.added ?? 0) === 1 ? "" : "s"}`];
        if (result.existing) parts.push(`${result.existing} already tracked`);
        if (result.invalid?.length) parts.push(`${result.invalid.length} invalid skipped`);
        toast.success(parts.join(" · "));
        if ((result.added ?? 0) > 0) {
          toast.info("Profile photos and follower counts will fill in on the first sync.");
        }
        setCandidates(null);
        setRawInput("");
        setOpen(false);
      } catch {
        toast.error("Import failed. Please try again.");
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card text-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" />
          <span className="font-medium">Import accounts you follow</span>
          <span className="hidden text-xs text-subtle sm:inline">
            Fill your inspiration list in one go
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          {candidates === null ? (
            <>
              <p className="text-sm text-muted-foreground">
                Instagram&apos;s API doesn&apos;t share your following list, but you can import it
                in seconds: paste usernames below, or upload the{" "}
                <span className="text-foreground">following.json</span> /{" "}
                <span className="text-foreground">following.html</span> file from Instagram&apos;s{" "}
                <a
                  href="https://www.instagram.com/download/request/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline-offset-4 hover:underline"
                >
                  Download your information
                </a>{" "}
                export. You&apos;ll review the list before anything is added.
              </p>

              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                rows={4}
                placeholder={"@creator_one\n@creator_two creator_three, https://www.instagram.com/creator_four/"}
                className="w-full rounded-lg border border-border-strong bg-surface-2 p-3 text-sm text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => parse(rawInput)} disabled={!rawInput.trim()}>
                  <UserPlus className="h-4 w-4" />
                  Review list
                </Button>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Upload export file
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.html,.txt"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{selected.length}</span> of{" "}
                  {candidates.length} accounts selected — untick any you don&apos;t want.
                </p>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setExcluded(new Set())}
                    className="text-muted-foreground transition hover:text-brand"
                  >
                    Select all
                  </button>
                  <span className="text-subtle">·</span>
                  <button
                    type="button"
                    onClick={() => setExcluded(new Set(candidates))}
                    className="text-muted-foreground transition hover:text-brand"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border-strong bg-background p-2 sm:grid-cols-3">
                {candidates.map((username) => {
                  const checked = !excluded.has(username);
                  return (
                    <button
                      key={username}
                      type="button"
                      onClick={() => toggle(username)}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                        checked ? "text-foreground hover:bg-secondary" : "text-subtle hover:bg-secondary"
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-brand" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">@{username}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {groups.length > 0 ? (
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Add to group (optional)</span>
                    <select
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      className="block h-9 rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60"
                    >
                      <option value="">No group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <Button type="button" onClick={submit} disabled={isPending || selected.length === 0}>
                  {isPending ? "Importing…" : `Add ${selected.length} account${selected.length === 1 ? "" : "s"}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCandidates(null)}
                  disabled={isPending}
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
