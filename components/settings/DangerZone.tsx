"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDict } from "@/lib/i18n/I18nProvider";

// Self-serve PDPL controls: export a JSON copy of your data, or permanently
// delete your account. Delete requires typing DELETE to arm the button. The
// confirmation word itself stays the literal English "DELETE" in every
// locale (the client-side check and the API both compare against that exact
// string), only the surrounding instructions are translated.
export function DangerZone() {
  const dict = useDict();
  const t = dict.settings.danger;
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
        throw new Error(body.error || t.couldNotDelete);
      }
      toast.success(t.deleteSuccess);
      router.replace("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dict.common.unknownError);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">{t.title}</h2>
        <p className="text-xs text-muted-foreground">{t.description}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t.exportTitle}</p>
          <p className="text-xs text-muted-foreground">{t.exportDescription}</p>
        </div>
        <Button asChild variant="outline">
          {/* Plain download link — the route streams an attachment. */}
          <a href="/api/account/export" download>
            <Download className="h-4 w-4" /> {dict.common.export}
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-danger">{t.deleteTitle}</p>
          <p className="text-xs text-muted-foreground">{t.deleteDescription}</p>
        </div>
        <AlertDialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPhrase(""); }}>
          <AlertDialog.Trigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4" /> {t.deleteButton}
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
              <AlertDialog.Title className="text-lg font-semibold text-foreground">
                {t.deleteDialogTitle}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                {t.deleteWarning}
                <span className="font-medium text-foreground">{t.deleteWarningEmphasis}</span>.
              </AlertDialog.Description>

              <label className="mt-4 block text-sm text-foreground">
                {t.typeConfirmPrefix} <span className="font-mono font-semibold">DELETE</span>{" "}
                {t.typeConfirmSuffix}
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
                    {dict.common.cancel}
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  variant="destructive"
                  disabled={phrase !== "DELETE" || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? dict.common.deleting : t.deletePermanently}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </div>
  );
}
