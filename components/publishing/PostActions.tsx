"use client";

import { useState, useTransition } from "react";
import { RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notifyError } from "@/lib/utils/api";
import { retryJob, deletePost } from "@/app/dashboard/publishing/actions";

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
