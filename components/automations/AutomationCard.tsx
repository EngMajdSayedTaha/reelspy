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
        toast.success(isActive ? "Automation paused" : "Automation resumed");
      } catch {
        toast.error("Could not update the automation.");
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this automation?",
      description: "New comments on this reel will no longer get replies or DMs.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("automation_id", automation.id);
    startTransition(async () => {
      try {
        await deleteAction(data);
        toast.success("Automation deleted");
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
        toast.success("Automation updated");
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
          : "border-amber-500/40 border-dashed bg-background opacity-80"
      }`}
    >
      {!isActive ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300">
          <PauseCircle className="h-4 w-4 shrink-0" />
          Paused — comments on this reel are ignored
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {automation.media_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={automation.media_thumbnail_url}
            alt="Reel thumbnail"
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
          <p className="line-clamp-2 text-sm text-foreground">{caption || "(no caption)"}</p>
          {automation.media_permalink ? (
            <a
              href={automation.media_permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-subtle transition hover:text-brand"
            >
              View on Instagram <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <Badge
          variant={isActive ? "default" : "outline"}
          className={isActive ? "" : "border-amber-500/50 bg-amber-500/15 text-amber-300"}
        >
          {isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-3">
          {automation.match_mode !== "any" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`keywords_${automation.id}`}>Keywords (comma separated)</Label>
              <Input
                id={`keywords_${automation.id}`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`templates_${automation.id}`}>Public replies (one per line)</Label>
            <Textarea
              id={`templates_${automation.id}`}
              rows={2}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dm_${automation.id}`}>DM message</Label>
            <Textarea
              id={`dm_${automation.id}`}
              rows={3}
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`link_${automation.id}`}>Link</Label>
            <Input
              id={`link_${automation.id}`}
              value={dmLink}
              onChange={(e) => setDmLink(e.target.value)}
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
          <div className="flex flex-wrap gap-1.5">
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

          <p className="line-clamp-2 break-words text-xs text-subtle">
            DM: {automation.dm_message}
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
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleToggleActive}
              disabled={isPending}
              aria-label={isActive ? "Pause automation" : "Resume automation"}
              title={isActive ? "Pause" : "Resume"}
              className={isActive ? "" : "border-amber-500/50 text-amber-300 hover:bg-amber-500/10"}
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
              aria-label="Delete automation"
              title="Delete automation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
