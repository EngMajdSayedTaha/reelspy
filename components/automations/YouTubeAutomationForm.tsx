"use client";

import { useState, useTransition } from "react";
import { MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type YouTubeAutomationFormProps = {
  action: ActionFn;
};

export function YouTubeAutomationForm({ action }: YouTubeAutomationFormProps) {
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [templates, setTemplates] = useState("Check the description for the link 👇");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!videoId.trim()) {
      setError("Enter a YouTube video link or id.");
      return;
    }
    if (matchMode !== "any" && !keywords.trim()) {
      setError("At least one keyword is required.");
      return;
    }
    if (!templates.trim()) {
      setError("Write at least one public reply.");
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
        toast.success("YouTube automation created — matching comments now get a public reply.");
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
        <MonitorPlay className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">New YouTube automation</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="yt_automation_video">Video link or id</Label>
            <Input
              id="yt_automation_video"
              placeholder="https://youtube.com/watch?v=… or 11-char id"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt_automation_title">Label (optional)</Label>
            <Input
              id="yt_automation_title"
              placeholder="My launch video"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt_automation_match_mode">Match</Label>
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
              <option value="contains">Comment contains a keyword</option>
              <option value="exact">Comment is exactly a keyword</option>
              <option value="any">Any comment (no keywords needed)</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Every new comment on this video gets a reply — your channel&apos;s own comments are
              always ignored. Only comments posted after you create the automation are answered, so
              the existing backlog isn&apos;t touched.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="yt_automation_keywords">Keywords (comma separated)</Label>
              <Input
                id="yt_automation_keywords"
                placeholder="link, guide, free"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="yt_automation_templates">Public replies (one per line, rotated)</Label>
            <Textarea
              id="yt_automation_templates"
              rows={3}
              placeholder={"Check the description for the link 👇\nJust pinned it for you!"}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create YouTube Automation"}
        </Button>
      </div>
    </div>
  );
}
