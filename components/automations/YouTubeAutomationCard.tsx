"use client";

import { useState, useTransition } from "react";
import { MonitorPlay, PauseCircle, Pencil, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { YouTubeAutomation } from "@/lib/auto-reply/types";

type ActionState = { error?: string };
type UpdateActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type YouTubeAutomationCardProps = {
  automation: YouTubeAutomation;
  updateAction: UpdateActionFn;
  toggleActiveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function YouTubeAutomationCard({
  automation,
  updateAction,
  toggleActiveAction,
  deleteAction,
}: YouTubeAutomationCardProps) {
  const confirm = useConfirm();
  const isActive = automation.is_active;

  const [editing, setEditing] = useState(false);
  const [keywords, setKeywords] = useState(automation.keywords.join(", "));
  const [templates, setTemplates] = useState(automation.public_reply_templates.join("\n"));
  const [isPending, startTransition] = useTransition();

  const videoLabel = automation.video_title ?? automation.video_id;
  const videoUrl = `https://www.youtube.com/watch?v=${automation.video_id}`;

  const handleToggleActive = () => {
    const data = new FormData();
    data.set("automation_id", automation.id);
    data.set("is_active", isActive ? "false" : "true");
    startTransition(async () => {
      try {
        await toggleActiveAction(data);
        toast.success(isActive ? "YouTube automation paused" : "YouTube automation resumed");
      } catch {
        toast.error("Could not update the automation.");
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this YouTube automation?",
      description: "Comments on this video will no longer get an auto-reply.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("automation_id", automation.id);
    startTransition(async () => {
      try {
        await deleteAction(data);
        toast.success("YouTube automation deleted");
      } catch {
        toast.error("Could not delete the automation.");
      }
    });
  };

  const handleSave = () => {
    const data = new FormData();
    data.set("automation_id", automation.id);
    data.set("keywords", keywords);
    data.set("match_mode", automation.match_mode);
    data.set("public_reply_templates", templates);
    startTransition(async () => {
      try {
        const result = await updateAction({}, data);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setEditing(false);
        toast.success("YouTube automation updated");
      } catch {
        toast.error("Could not update the automation.");
      }
    });
  };

  return (
    <article
      className={`min-w-0 space-y-3.5 rounded-2xl border p-3.5 text-foreground transition-colors ${
        isActive
          ? "border-border bg-card hover:border-border-strong"
          : "border-warning/40 border-dashed bg-background opacity-80"
      }`}
    >
      {!isActive ? (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
          <PauseCircle className="h-4 w-4 shrink-0" />
          Paused — comments on this video are ignored
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
          <MonitorPlay className={`h-5 w-5 ${isActive ? "text-brand" : "text-subtle"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium text-foreground hover:underline"
            title={videoLabel}
          >
            {videoLabel}
          </a>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {automation.match_mode === "any" ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-brand">
                Any comment
              </Badge>
            ) : (
              automation.keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="border-border-strong text-muted-foreground">
                  {keyword}
                </Badge>
              ))
            )}
          </div>
        </div>
        <Badge
          variant={isActive ? "default" : "outline"}
          className={isActive ? "" : "border-warning/50 bg-warning/15 text-warning"}
        >
          {isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-3">
          {automation.match_mode !== "any" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`yt_keywords_${automation.id}`}>Keywords (comma separated)</Label>
              <Input
                id={`yt_keywords_${automation.id}`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`yt_templates_${automation.id}`}>Public replies (one per line)</Label>
            <Textarea
              id={`yt_templates_${automation.id}`}
              rows={3}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="line-clamp-2 text-xs text-subtle">
            Reply: {automation.public_reply_templates[0] ?? "—"}
            {automation.public_reply_templates.length > 1
              ? ` (+${automation.public_reply_templates.length - 1} more)`
              : ""}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setEditing(true)}
              disabled={isPending}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleToggleActive}
              disabled={isPending}
              aria-label={isActive ? "Pause YouTube automation" : "Resume YouTube automation"}
              title={isActive ? "Pause" : "Resume"}
              className={isActive ? "" : "border-warning/50 text-warning hover:bg-warning/10"}
            >
              <Power className="h-4 w-4" />
              {!isActive ? "Resume" : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={isPending}
              aria-label="Delete YouTube automation"
              title="Delete YouTube automation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
