"use client";

import { useState, useTransition } from "react";
import { ExternalLink, MessageCircleReply, PauseCircle, Pencil, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { ReelAutomation } from "@/lib/auto-reply/types";

type ActionState = { error?: string };
type UpdateActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type AutomationCardProps = {
  automation: ReelAutomation;
  updateAction: UpdateActionFn;
  toggleActiveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function AutomationCard({
  automation,
  updateAction,
  toggleActiveAction,
  deleteAction,
}: AutomationCardProps) {
  const confirm = useConfirm();
  const dict = useDict().automations.card;
  const common = useDict().common;
  const isActive = automation.is_active;

  const [editing, setEditing] = useState(false);
  const [keywords, setKeywords] = useState(automation.keywords.join(", "));
  const [templates, setTemplates] = useState(automation.public_reply_templates.join("\n"));
  const [dmMessage, setDmMessage] = useState(automation.dm_message);
  const [dmLink, setDmLink] = useState(automation.dm_link ?? "");
  const [isPending, startTransition] = useTransition();

  const caption = (automation.media_caption ?? "").replace(/\s+/g, " ").trim();

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
    data.set("dm_message", dmMessage);
    data.set("dm_link", dmLink);
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
        {automation.media_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={automation.media_thumbnail_url}
            alt={dict.reelThumbnailAlt}
            referrerPolicy="no-referrer"
            className={`h-16 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border-strong ${
              isActive ? "" : "grayscale"
            }`}
          />
        ) : (
          <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary ring-1 ring-border-strong">
            <MessageCircleReply className="h-5 w-5 text-subtle" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-foreground">{caption || dict.noCaption}</p>
          {automation.media_permalink ? (
            <a
              href={automation.media_permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-subtle transition hover:text-brand"
            >
              {dict.viewOnInstagram} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
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
              <Label htmlFor={`keywords_${automation.id}`}>{dict.keywordsLabel}</Label>
              <Input
                id={`keywords_${automation.id}`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`templates_${automation.id}`}>{dict.publicRepliesLabel}</Label>
            <Textarea
              id={`templates_${automation.id}`}
              rows={2}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dm_${automation.id}`}>{dict.dmMessageLabel}</Label>
            <Textarea
              id={`dm_${automation.id}`}
              rows={3}
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`link_${automation.id}`}>{dict.linkLabel}</Label>
            <Input
              id={`link_${automation.id}`}
              value={dmLink}
              onChange={(e) => setDmLink(e.target.value)}
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
          <div className="flex flex-wrap gap-1.5">
            {automation.match_mode === "any" ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-brand">
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

          <p className="line-clamp-2 break-words text-xs text-subtle">
            {dict.dmPrefix} {automation.dm_message}
            {automation.dm_link ? ` · ${automation.dm_link}` : ""}
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
