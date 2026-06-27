"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Pencil, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notifyError } from "@/lib/utils/api";
import { retryJob, deletePost, updateScheduledPost } from "@/app/dashboard/publishing/actions";

// Turn a stored UTC ISO timestamp into the `datetime-local` value (no zone) the
// browser expects, expressed in the viewer's local time. Done on the client so
// the offset is the user's, not the server's.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function RetryButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          try {
            await retryJob(jobId);
            setDone(true);
            toast.success("Retried — refreshing status.");
          } catch (error) {
            notifyError(error, "Retry failed.");
          }
        })
      }
    >
      <RotateCw className="h-3 w-3" /> Retry
    </Button>
  );
}

type EditPostButtonProps = {
  postId: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  /** Stored UTC ISO timestamp the post is currently scheduled for. */
  scheduledAt: string;
};

export function EditPostButton({ postId, title, caption, hashtags, scheduledAt }: EditPostButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [titleV, setTitleV] = useState("");
  const [captionV, setCaptionV] = useState("");
  const [hashtagsV, setHashtagsV] = useState("");
  const [whenV, setWhenV] = useState("");

  // Seed the form from the latest props whenever the dialog opens. Done in the
  // open handler (not an effect) and on the client, where the datetime can be
  // converted into the user's local timezone.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setTitleV(title ?? "");
      setCaptionV(caption ?? "");
      setHashtagsV(hashtags ?? "");
      setWhenV(toLocalInputValue(scheduledAt));
    }
    setOpen(next);
  };

  const save = () => {
    if (!whenV) {
      toast.error("Pick a date and time.");
      return;
    }
    start(async () => {
      try {
        await updateScheduledPost({
          postId,
          title: titleV.trim() || null,
          caption: captionV.trim() || null,
          hashtags: hashtagsV.trim() || null,
          // datetime-local has no zone; new Date() reads it as local, toISOString
          // hands the server UTC — the same round-trip the composer uses.
          scheduledAt: new Date(whenV).toISOString(),
        });
        toast.success("Schedule updated.");
        setOpen(false);
      } catch (error) {
        notifyError(error, "Could not update the post.");
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" title="Edit scheduled post">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
          <Dialog.Title className="text-lg font-semibold text-foreground">Edit scheduled post</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Change when it posts or tweak the copy. Times use your local timezone.
          </Dialog.Description>

          <div className="space-y-2">
            <Label htmlFor={`edit-when-${postId}`}>Scheduled time</Label>
            <Input
              id={`edit-when-${postId}`}
              type="datetime-local"
              value={whenV}
              onChange={(e) => setWhenV(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-title-${postId}`}>Title (YouTube / FB)</Label>
            <Input
              id={`edit-title-${postId}`}
              value={titleV}
              onChange={(e) => setTitleV(e.target.value)}
              placeholder="Optional title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-caption-${postId}`}>Caption</Label>
            <Textarea
              id={`edit-caption-${postId}`}
              value={captionV}
              onChange={(e) => setCaptionV(e.target.value)}
              placeholder="Shared caption…"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-hashtags-${postId}`}>Hashtags</Label>
            <Input
              id={`edit-hashtags-${postId}`}
              value={hashtagsV}
              onChange={(e) => setHashtagsV(e.target.value)}
              placeholder="#reels #viral"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-9 rounded-lg border border-border-strong bg-surface-2 px-4 text-sm text-muted-foreground transition hover:border-border-strong"
              >
                Cancel
              </button>
            </Dialog.Close>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DeletePostButton({ postId }: { postId: string }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const handleClick = async () => {
    const ok = await confirm({
      title: "Delete this post?",
      description: "The uploaded video and its publish history will be removed. Already-published posts on each platform are not affected.",
      confirmText: "Delete",
      cancelText: "Keep",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        await deletePost(postId);
        toast.success("Deleted.");
      } catch (error) {
        notifyError(error, "Could not delete.");
      }
    });
  };

  return (
    <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={handleClick}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
