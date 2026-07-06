"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDict } from "@/lib/i18n/I18nProvider";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type DmAutomationFormProps = {
  action: ActionFn;
};

export function DmAutomationForm({ action }: DmAutomationFormProps) {
  const dict = useDict().automations;
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyLink, setReplyLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (matchMode !== "any" && !keywords.trim()) {
      setError(dict.errors.keywordRequired);
      return;
    }
    if (!replyMessage.trim()) {
      setError(dict.errors.replyMessageRequired);
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
        toast.success(dict.dmForm.createSuccess);
      } catch {
        const message = dict.dmForm.createError;
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">{dict.dmForm.newAutomation}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm_automation_match_mode">{dict.dmForm.matchLabel}</Label>
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
              <option value="contains">{dict.dmForm.matchContains}</option>
              <option value="exact">{dict.dmForm.matchExact}</option>
              <option value="any">{dict.dmForm.matchAny}</option>
            </select>
          </div>

          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {dict.dmForm.anyMessageHint}
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="dm_automation_keywords">{dict.dmForm.keywordsLabel}</Label>
              <Input
                id="dm_automation_keywords"
                placeholder={dict.dmForm.keywordsPlaceholder}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm_automation_reply">{dict.dmForm.replyMessageLabel}</Label>
            <Textarea
              id="dm_automation_reply"
              rows={3}
              placeholder={dict.dmForm.replyMessagePlaceholder}
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dm_automation_link">{dict.dmForm.linkLabel}</Label>
            <Input
              id="dm_automation_link"
              placeholder={dict.dmForm.linkPlaceholder}
              value={replyLink}
              onChange={(e) => setReplyLink(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? <p className="text-sm text-danger">{error}</p> : <span className="hidden sm:block" />}
        <Button type="button" onClick={submit} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? dict.dmForm.creating : dict.dmForm.createAutomation}
        </Button>
      </div>
    </div>
  );
}
