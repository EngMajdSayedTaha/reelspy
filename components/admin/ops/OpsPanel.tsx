"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { JobsPanel } from "@/components/admin/ops/JobsPanel";
import { CronPanel } from "@/components/admin/ops/CronPanel";
import { CookiesPanel } from "@/components/admin/ops/CookiesPanel";
import { LimitsPanel } from "@/components/admin/ops/LimitsPanel";
import { SettingsPanel } from "@/components/admin/ops/SettingsPanel";

const TABS = [
  { id: "jobs", label: "Jobs" },
  { id: "cron", label: "Cron" },
  { id: "cookies", label: "IG Cookies" },
  { id: "limits", label: "Limits" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function OpsPanel() {
  const [tab, setTab] = useState<TabId>("jobs");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" ? <JobsPanel /> : null}
      {tab === "cron" ? <CronPanel /> : null}
      {tab === "cookies" ? <CookiesPanel /> : null}
      {tab === "limits" ? <LimitsPanel /> : null}
      {tab === "settings" ? <SettingsPanel /> : null}
    </div>
  );
}
