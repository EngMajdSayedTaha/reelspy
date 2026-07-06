"use client";

import { useState, useTransition } from "react";
import { MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDict } from "@/lib/i18n/I18nProvider";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type YouTubeAutomationFormProps = {
  action: ActionFn;
};

export function YouTubeAutomationForm({ action }: YouTubeAutomationFormProps) {
  const dict = useDict().automations;
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [templates, setTemplates] = useState(dict.ytForm.defaultTemplate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!videoId.trim()) {
      setError(dict.ytForm.videoRequired);
      return;
    }
    if (matchMode !== "any" && !keywords.trim()) {
      setError(dict.errors.keywordRequired);
      return;
    }
    if (!templates.trim()) {
      setError(dict.errors.publicReplyRequired);
      return;
    }
    setError(null);

    const data = new FormData();
    data.set("video_id", videoId);
    data.set("video_title", videoTitle);
    data.set("keywords", keywords);
    data.set("match_mode", matchMode);
    data.set("public_reply_templates", templates);

    startTransition(async () => {
      try {
        const result = await action({}, data);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setVideoId("");
        setVideoTitle("");
        setKeywords("");
        toast.success(dict.ytForm.createSuccess);
      } catch {
        const message = dict.ytForm.createError;
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <MonitorPlay className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">{dict.ytForm.newAutomation}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="yt_automation_video">{dict.ytForm.videoLabel}</Label>
            <Input
              id="yt_automation_video"
              placeholder={dict.ytForm.videoPlaceholder}
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt_automation_title">{dict.ytForm.labelOptional}</Label>
            <Input
              id="yt_automation_title"
              placeholder={dict.ytForm.labelPlaceholder}
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt_automation_match_mode">{dict.ytForm.matchLabel}</Label>
            <select
              id="yt_automation_match_mode"
              value={matchMode}
              disabled={isPending}
              onChange={(e) =>
                setMatchMode(
                  e.target.value === "exact" ? "exact" : e.target.value === "any" ? "any" : "contains"
                )
              }
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            >
              <option value="contains">{dict.ytForm.matchContains}</option>
              <option value="exact">{dict.ytForm.matchExact}</option>
              <option value="any">{dict.ytForm.matchAny}</option>
            </select>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {dict.ytForm.anyCommentHint}
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="yt_automation_keywords">{dict.ytForm.keywordsLabel}</Label>
              <Input
                id="yt_automation_keywords"
                placeholder={dict.ytForm.keywordsPlaceholder}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="yt_automation_templates">{dict.ytForm.publicRepliesLabel}</Label>
            <Textarea
              id="yt_automation_templates"
              rows={3}
              placeholder={dict.ytForm.publicRepliesPlaceholder}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? <p className="text-sm text-danger">{error}</p> : <span className="hidden sm:block" />}
        <Button type="button" onClick={submit} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? dict.ytForm.creating : dict.ytForm.createAutomation}
        </Button>
      </div>
    </div>
  );
}
