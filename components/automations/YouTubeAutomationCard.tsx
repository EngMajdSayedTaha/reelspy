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
import { useDict } from "@/lib/i18n/I18nProvider";
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
  const dict = useDict().automations.ytCard;
  const common = useDict().common;
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
        toast.success(isActive ? dict.toastPaused : dict.toastResumed);
      } catch {
        toast.error(dict.toastUpdateError);
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: dict.confirmDeleteTitle,
      description: dict.confirmDeleteDesc,
      confirmText: common.delete,
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("automation_id", automation.id);
    startTransition(async () => {
      try {
        await deleteAction(data);
        toast.success(dict.toastDeleted);
      } catch {
        toast.error(dict.toastDeleteError);
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
        toast.success(dict.toastUpdated);
      } catch {
        toast.error(dict.toastUpdateError);
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
          {dict.pausedNotice}
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
              <Badge variant="outline" className="border-accent-brand/40 bg-accent-brand/10 text-accent-brand">
                {dict.anyComment}
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
          {isActive ? dict.active : dict.paused}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-3">
          {automation.match_mode !== "any" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`yt_keywords_${automation.id}`}>{dict.keywordsLabel}</Label>
              <Input
                id={`yt_keywords_${automation.id}`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`yt_templates_${automation.id}`}>{dict.publicRepliesLabel}</Label>
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
              {isPending ? common.saving : common.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              {common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="line-clamp-2 text-xs text-subtle">
            {dict.replyPrefix} {automation.public_reply_templates[0] ?? "—"}
            {automation.public_reply_templates.length > 1
              ? dict.moreCount(automation.public_reply_templates.length - 1)
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
              {common.edit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleToggleActive}
              disabled={isPending}
              aria-label={isActive ? dict.pauseAria : dict.resumeAria}
              title={isActive ? dict.pauseTitle : dict.resume}
              className={isActive ? "" : "border-warning/50 text-warning hover:bg-warning/10"}
            >
              <Power className="h-4 w-4" />
              {!isActive ? dict.resume : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={dict.deleteAria}
              title={dict.deleteTitle}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
