"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type DmAutomationFormProps = {
  action: ActionFn;
};

export function DmAutomationForm({ action }: DmAutomationFormProps) {
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyLink, setReplyLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (matchMode !== "any" && !keywords.trim()) {
      setError("At least one keyword is required.");
      return;
    }
    if (!replyMessage.trim()) {
      setError("The reply message is required.");
      return;
    }
    setError(null);

    const data = new FormData();
    data.set("keywords", keywords);
    data.set("match_mode", matchMode);
    data.set("reply_message", replyMessage);
    data.set("reply_link", replyLink);

    startTransition(async () => {
      try {
        const result = await action({}, data);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setKeywords("");
        setReplyMessage("");
        setReplyLink("");
        toast.success("DM automation created — matching messages now get an auto-reply.");
      } catch {
        const message = "Could not create the automation. Please try again.";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">New DM automation</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm_automation_match_mode">Match</Label>
            <select
              id="dm_automation_match_mode"
              value={matchMode}
              disabled={isPending}
              onChange={(e) =>
                setMatchMode(
                  e.target.value === "exact" ? "exact" : e.target.value === "any" ? "any" : "contains"
                )
              }
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            >
              <option value="contains">Message contains a keyword</option>
              <option value="exact">Message is exactly a keyword</option>
              <option value="any">Any message (no keywords needed)</option>
            </select>
          </div>

          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Every incoming DM gets the reply — but each person at most once per 24 hours, so
              normal conversations aren&apos;t spammed. Story replies are always ignored.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="dm_automation_keywords">Keywords (comma separated)</Label>
              <Input
                id="dm_automation_keywords"
                placeholder="price, info, link"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm_automation_reply">Reply message</Label>
            <Textarea
              id="dm_automation_reply"
              rows={3}
              placeholder="Thanks for reaching out! Here's everything you need 👇"
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dm_automation_link">Link (sent inside the reply)</Label>
            <Input
              id="dm_automation_link"
              placeholder="https://your-link.com"
              value={replyLink}
              onChange={(e) => setReplyLink(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? <p className="text-sm text-rose-400">{error}</p> : <span className="hidden sm:block" />}
        <Button type="button" onClick={submit} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Creating…" : "Create DM Automation"}
        </Button>
      </div>
    </div>
  );
}
