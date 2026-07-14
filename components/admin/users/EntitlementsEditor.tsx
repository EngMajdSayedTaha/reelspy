"use client";

import type { Entitlements } from "@/lib/billing/entitlements";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Editor for a custom plan's Entitlements object. Numeric fields accept -1 for
// "unlimited" (matches lib/billing/entitlements.ts UNLIMITED). Controlled — the
// parent owns the value.
const NUM_FIELDS: { key: keyof Omit<Entitlements, "model">; label: string }[] = [
  { key: "accounts", label: "Tracked accounts" },
  { key: "scripts_mo", label: "Scripts / month" },
  { key: "transcripts_mo", label: "Transcripts / month" },
  { key: "automations", label: "Automations" },
  { key: "publish_targets", label: "Publish targets" },
  { key: "ig_connections", label: "IG connections" },
];

export const DEFAULT_CUSTOM: Entitlements = {
  accounts: 30,
  scripts_mo: 60,
  transcripts_mo: 30,
  automations: 15,
  publish_targets: 1,
  ig_connections: 1,
  model: "sonnet",
};

export function EntitlementsEditor({
  value,
  onChange,
}: {
  value: Entitlements;
  onChange: (next: Entitlements) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-2">
      {NUM_FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{f.label}</Label>
          <Input
            type="number"
            value={value[f.key]}
            onChange={(e) => onChange({ ...value, [f.key]: Math.trunc(Number(e.target.value) || 0) })}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">AI model</Label>
        <select
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value as Entitlements["model"] })}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="haiku">haiku</option>
          <option value="sonnet">sonnet</option>
          <option value="opus">opus</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Use -1 for unlimited.</p>
    </div>
  );
}
