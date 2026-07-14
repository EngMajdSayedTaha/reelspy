"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";

type Setting = { key: string; value: unknown; updated_at: string; editable: boolean; secret: boolean };

export function SettingsPanel() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newKey, setNewKey] = useState("flag:");
  const [newValue, setNewValue] = useState('{ "enabled": true }');
  const confirm = useConfirm();

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<{ settings: Setting[] }>("/api/admin/ops/settings");
      if (!signal.cancelled) setSettings(res.settings);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load settings.");
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

  const save = async (key: string, rawValue: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      toast.error("Value must be valid JSON.");
      return;
    }
    const ok = await confirm({
      title: `Update ${key}?`,
      description: "This changes application behavior immediately.",
      confirmText: "Save",
    });
    if (!ok) return;
    try {
      await requestJson("/api/admin/ops/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: parsed }),
      });
      toast.success("Setting saved");
      setEditing(null);
      load({ cancelled: false });
    } catch (err) {
      notifyError(err);
    }
  };

  if (loading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {(settings ?? []).map((s) => (
          <li key={s.key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">{s.key}</span>
                {s.secret ? <Badge variant="destructive">secret</Badge> : null}
                {s.editable ? <Badge variant="secondary">editable</Badge> : null}
              </div>
              {s.editable ? (
                editing === s.key ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" onClick={() => save(s.key, editValue)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(s.key);
                      setEditValue(JSON.stringify(s.value, null, 2));
                    }}
                  >
                    Edit
                  </Button>
                )
              ) : null}
            </div>
            {editing === s.key ? (
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="mt-2 min-h-[100px] font-mono text-xs"
              />
            ) : (
              <div className="mt-2">
                <JsonViewer data={s.value} label="value" />
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">updated {new Date(s.updated_at).toLocaleString()}</p>
          </li>
        ))}
        {settings && settings.length === 0 ? (
          <li className="text-sm text-muted-foreground">No settings yet.</li>
        ) : null}
      </ul>

      <div className="rounded-lg border border-dashed border-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Create / set a feature flag</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="flag:my_feature" className="sm:max-w-xs" />
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder='{ "enabled": true }' className="flex-1 font-mono text-xs" />
          <Button variant="secondary" size="lg" onClick={() => save(newKey.trim(), newValue)} disabled={!newKey.startsWith("flag:")}>
            Set flag
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Only keys under the <code>flag:</code> prefix are editable here.</p>
      </div>
    </div>
  );
}
