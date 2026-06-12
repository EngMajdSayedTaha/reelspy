"use client";

import { useState, useTransition } from "react";
import { PauseCircle, Pencil, Power, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DmAutomation } from "@/lib/auto-reply/types";

type ActionState = { error?: string };
type UpdateActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type DmAutomationCardProps = {
  automation: DmAutomation;
  updateAction: UpdateActionFn;
  toggleActiveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function DmAutomationCard({
  automation,
  updateAction,
  toggleActiveAction,
  deleteAction,
}: DmAutomationCardProps) {
  const confirm = useConfirm();
  const isActive = automation.is_active;

  const [editing, setEditing] = useState(false);
  const [keywords, setKeywords] = useState(automation.keywords.join(", "));
  const [replyMessage, setReplyMessage] = useState(automation.reply_message);
  const [replyLink, setReplyLink] = useState(automation.reply_link ?? "");
  const [isPending, startTransition] = useTransition();

  const handleToggleActive = () => {
    const data = new FormData();
    data.set("automation_id", automation.id);
    data.set("is_active", isActive ? "false" : "true");
    startTransition(async () => {
      try {
        await toggleActiveAction(data);
        toast.success(isActive ? "DM automation paused" : "DM automation resumed");
      } catch {
        toast.error("Could not update the automation.");
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this DM automation?",
      description: "Incoming messages will no longer get this auto-reply.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("automation_id", automation.id);
    startTransition(async () => {
      try {
        await deleteAction(data);
        toast.success("DM automation deleted");
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
    data.set("reply_message", replyMessage);
    data.set("reply_link", replyLink);
    startTransition(async () => {
      try {
        const result = await updateAction({}, data);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setEditing(false);
        toast.success("DM automation updated");
      } catch {
        toast.error("Could not update the automation.");
      }
    });
  };

  return (
    <article
      className={`space-y-3.5 rounded-2xl border p-3.5 text-zinc-100 transition-colors ${
        isActive
          ? "border-[#1f1f1f] bg-[#111111] hover:border-[#2e2e2e]"
          : "border-amber-500/40 border-dashed bg-[#0d0d0d] opacity-80"
      }`}
    >
      {!isActive ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300">
          <PauseCircle className="h-4 w-4 shrink-0" />
          Paused — incoming DMs are ignored by this automation
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] ring-1 ring-[#2e2e2e]">
          <Send className={`h-5 w-5 ${isActive ? "text-[#F9E400]" : "text-zinc-500"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {automation.match_mode === "any" ? (
              <Badge variant="outline" className="border-[#F9E400]/40 bg-[#F9E400]/10 text-[#F9E400]">
                Any message
              </Badge>
            ) : (
              automation.keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="border-[#2e2e2e] text-zinc-300">
                  {keyword}
                </Badge>
              ))
            )}
          </div>
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
              <Label htmlFor={`dm_keywords_${automation.id}`}>Keywords (comma separated)</Label>
              <Input
                id={`dm_keywords_${automation.id}`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`dm_reply_${automation.id}`}>Reply message</Label>
            <Textarea
              id={`dm_reply_${automation.id}`}
              rows={3}
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dm_link_${automation.id}`}>Link</Label>
            <Input
              id={`dm_link_${automation.id}`}
              value={replyLink}
              onChange={(e) => setReplyLink(e.target.value)}
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
          <p className="line-clamp-2 text-xs text-zinc-500">
            Reply: {automation.reply_message}
            {automation.reply_link ? ` · ${automation.reply_link}` : ""}
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
              aria-label={isActive ? "Pause DM automation" : "Resume DM automation"}
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
              aria-label="Delete DM automation"
              title="Delete DM automation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
