"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Self-serve PDPL controls: export a JSON copy of your data, or permanently
// delete your account. Delete requires typing DELETE to arm the button.
export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not delete your account.");
      }
      toast.success("Your account has been deleted.");
      router.replace("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">Data &amp; privacy</h2>
        <p className="text-xs text-muted-foreground">
          Download a copy of your data, or permanently delete your account.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Export my data</p>
          <p className="text-xs text-muted-foreground">
            A JSON file with your profile, accounts, reels, scripts, automations, and events.
          </p>
        </div>
        <Button asChild variant="outline">
          {/* Plain download link — the route streams an attachment. */}
          <a href="/api/account/export" download>
            <Download className="h-4 w-4" /> Export
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-danger">Delete account</p>
          <p className="text-xs text-muted-foreground">
            Removes your profile and all associated data. This cannot be undone.
          </p>
        </div>
        <AlertDialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPhrase(""); }}>
          <AlertDialog.Trigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
              <AlertDialog.Title className="text-lg font-semibold text-foreground">
                Delete your account?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                This permanently deletes your profile, tracked accounts, reels, scripts,
                automations, uploaded videos, and event history, and revokes any connected
                Instagram access. This <span className="font-medium text-foreground">cannot be undone</span>.
              </AlertDialog.Description>

              <label className="mt-4 block text-sm text-foreground">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
                <Input
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="mt-1.5"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button variant="outline" disabled={deleting}>
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  variant="destructive"
                  disabled={phrase !== "DELETE" || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </div>
  );
}
