"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";

type Status = {
  cookies: {
    configured: boolean;
    source: "db" | "env" | null;
    updatedAt: string | null;
    lastOkAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    rotations: number;
  };
  ytdlp: unknown;
};

// Base64-encode UTF-8 text in the browser (btoa needs latin1).
function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function CookiesPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [paste, setPaste] = useState("");
  const [liveTest, setLiveTest] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<Status>("/api/admin/ig-cookies");
      if (!signal.cancelled) setStatus(res);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load cookie status.");
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const save = async () => {
    if (!paste.trim()) return;
    setSaving(true);
    try {
      const res = await requestJson<{ cookieCount: number; liveTested: boolean }>("/api/admin/ig-cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies_b64: toB64(paste), live_test: liveTest }),
        timeoutMs: 130_000,
      });
      toast.success(`Saved ${res.cookieCount} cookies${res.liveTested ? " (live-tested)" : ""}`);
      setPaste("");
      load({ cancelled: false });
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-48 rounded-xl" />;

  const c = status?.cookies;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Configured</span>
          {c?.configured ? (
            <Badge variant="secondary">yes ({c.source})</Badge>
          ) : (
            <Badge variant="destructive">no</Badge>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Last OK</span>
          <span className="text-sm">{fmt(c?.lastOkAt ?? null)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Rotations</span>
          <span className="text-sm tabular-nums">{c?.rotations ?? 0}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Updated</span>
          <span className="text-sm">{fmt(c?.updatedAt ?? null)}</span>
        </div>
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Last error</span>
          <span className="text-sm text-destructive">{c?.lastError ?? "—"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <label className="text-sm font-medium text-foreground">Rotate cookies</label>
        <p className="text-xs text-muted-foreground">
          Paste a Netscape cookies.txt export. It&apos;s base64-encoded in your browser before upload; the
          candidate is validated (and optionally live-tested from Vercel&apos;s egress) before it replaces the
          current session.
        </p>
        <Textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="# Netscape HTTP Cookie File&#10;.instagram.com	TRUE	/	TRUE	…"
          className="min-h-[140px] font-mono text-xs"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={liveTest} onChange={(e) => setLiveTest(e.target.checked)} />
            Live-test before saving
          </label>
          <Button variant="default" size="lg" disabled={saving || !paste.trim()} onClick={save}>
            {saving ? "Saving…" : "Save cookies"}
          </Button>
        </div>
      </div>
    </div>
  );
}
