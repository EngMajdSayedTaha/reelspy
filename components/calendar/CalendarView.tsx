"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, GripVertical, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type CalendarScript = {
  id: string;
  hook: string | null;
  status: string | null;
  scheduled_date: string | null;
  viral_pattern: string | null;
  platform: string | null;
  created_at: string;
};

type CalendarViewProps = {
  scripts: CalendarScript[];
  scheduleAction: (scriptId: string, date: string) => Promise<void>;
  unscheduleAction: (scriptId: string) => Promise<void>;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-border-strong",
  ready: "bg-blue-500/70",
  published: "bg-emerald-500/70",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarView({ scripts, scheduleAction, unscheduleAction }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Drag & drop state (HTML5 DnD) + tap-to-place fallback for touch.
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const scheduled = scripts.filter((s) => s.scheduled_date);
  const unscheduled = scripts.filter((s) => !s.scheduled_date);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const scriptsByDate = new Map<string, CalendarScript[]>();
  for (const script of scheduled) {
    const date = script.scheduled_date!.slice(0, 10);
    const existing = scriptsByDate.get(date) ?? [];
    scriptsByDate.set(date, [...existing, script]);
  }

  const placingScript = placingId ? scripts.find((s) => s.id === placingId) ?? null : null;

  const moveTo = (scriptId: string, date: string) => {
    const script = scripts.find((s) => s.id === scriptId);
    if (!script || script.scheduled_date?.slice(0, 10) === date) return;
    startTransition(async () => {
      try {
        await scheduleAction(scriptId, date);
        toast.success(`Scheduled for ${date}`);
      } catch {
        toast.error("Could not schedule the script.");
      }
    });
  };

  const unschedule = (scriptId: string) => {
    startTransition(async () => {
      try {
        await unscheduleAction(scriptId);
        toast.success("Moved back to unscheduled");
      } catch {
        toast.error("Could not unschedule the script.");
      }
    });
  };

  const onDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const scriptId = e.dataTransfer.getData("text/plain");
    if (scriptId) moveTo(scriptId, date);
  };

  const onDayClick = (dateStr: string) => {
    if (placingId) {
      moveTo(placingId, dateStr);
      setPlacingId(null);
      return;
    }
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const selectedScripts = selectedDate ? scriptsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {MONTH_NAMES[month]} {year}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth} aria-label="Previous month">
              ‹
            </Button>
            <Button variant="outline" size="sm" onClick={nextMonth} aria-label="Next month">
              ›
            </Button>
          </div>
        </div>

        {placingScript ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-brand">
            <span className="truncate">
              Pick a day for “{placingScript.hook?.slice(0, 40) ?? "script"}”
            </span>
            <button
              type="button"
              onClick={() => setPlacingId(null)}
              className="shrink-0 transition hover:text-foreground"
              aria-label="Cancel placing"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Day names */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-subtle">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className={`grid grid-cols-7 gap-1 ${isPending ? "opacity-70" : ""}`}>
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`blank-${i}`} className="min-h-[52px] rounded-md sm:min-h-[84px]" />;
            }

            const dateStr = toDateStr(year, month, day);
            const dayScripts = scriptsByDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const isDragOver = dragOverDate === dateStr;

            return (
              <div
                key={dateStr}
                onClick={() => onDayClick(dateStr)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverDate(dateStr);
                }}
                onDragLeave={() => setDragOverDate((d) => (d === dateStr ? null : d))}
                onDrop={(e) => onDrop(e, dateStr)}
                className={`min-h-[52px] rounded-md border p-1 transition sm:min-h-[84px] sm:p-1.5 ${
                  isDragOver
                    ? "border-primary bg-primary/10"
                    : isToday
                      ? "border-primary/40 bg-primary/5"
                      : "border-border-strong bg-background"
                } ${placingId || dayScripts.length > 0 ? "cursor-pointer hover:border-border-strong" : ""}`}
              >
                <p className={`text-xs font-medium ${isToday ? "text-brand" : "text-muted-foreground"}`}>
                  {day}
                </p>
                {/* Phones: text chips are unreadable in ~45px cells, so show
                    status dots instead — tapping the day opens the detail. */}
                <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  {dayScripts.slice(0, 4).map((s) => (
                    <span
                      key={s.id}
                      className={`h-1.5 w-1.5 rounded-full ${
                        STATUS_COLORS[s.status ?? "draft"] ?? STATUS_COLORS.draft
                      }`}
                    />
                  ))}
                  {dayScripts.length > 4 ? (
                    <span className="text-[9px] leading-none text-subtle">
                      +{dayScripts.length - 4}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 hidden space-y-0.5 sm:block">
                  {dayScripts.slice(0, 2).map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title={`${s.hook ?? "Script"} — drag to another day`}
                      className={`cursor-grab truncate rounded px-1 py-0.5 text-[10px] leading-tight text-foreground active:cursor-grabbing ${
                        STATUS_COLORS[s.status ?? "draft"] ?? STATUS_COLORS.draft
                      }`}
                    >
                      {s.hook?.slice(0, 25) ?? "Script"}
                    </div>
                  ))}
                  {dayScripts.length > 2 ? (
                    <p className="text-[10px] text-subtle">+{dayScripts.length - 2} more</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedDate && selectedScripts.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-foreground">{selectedDate}</h3>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-xs text-subtle hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {selectedScripts.map((s) => (
                <div key={s.id} className="rounded-md border border-border-strong bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        s.status === "published"
                          ? "border-emerald-500/50 text-emerald-400"
                          : s.status === "ready"
                          ? "border-blue-500/50 text-blue-400"
                          : "border-border-strong text-muted-foreground"
                      }`}
                    >
                      {s.status ?? "draft"}
                    </span>
                    {s.viral_pattern ? (
                      <Badge variant="outline" className="text-xs text-brand border-primary/30">
                        {s.viral_pattern}
                      </Badge>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => unschedule(s.id)}
                      className="ml-auto text-xs text-subtle transition hover:text-rose-400 disabled:opacity-50"
                    >
                      Unschedule
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{s.hook ?? "No hook"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Unscheduled tray — drag from here onto a day, or drop a chip back to unschedule. */}
      <aside
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const scriptId = e.dataTransfer.getData("text/plain");
          const script = scripts.find((s) => s.id === scriptId);
          if (script?.scheduled_date) unschedule(scriptId);
        }}
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-foreground">Unscheduled scripts</h3>
          <span className="rounded-full bg-border px-1.5 text-xs text-muted-foreground">
            {unscheduled.length}
          </span>
        </div>
        <p className="text-xs text-subtle">
          Drag a script onto a day — or tap it, then tap a day. Drop a scheduled chip here to
          unschedule it.
        </p>

        {unscheduled.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong p-4 text-center">
            <Inbox className="h-5 w-5 text-subtle" />
            <p className="text-xs text-subtle">
              Nothing waiting. Generate scripts on the Scripts page.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {unscheduled.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", s.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setPlacingId((prev) => (prev === s.id ? null : s.id))}
                title="Drag onto a day, or tap then tap a day"
                className={`flex cursor-grab items-start gap-1.5 rounded-lg border p-2 text-xs transition active:cursor-grabbing ${
                  placingId === s.id
                    ? "border-primary bg-primary/10 text-brand"
                    : "border-border-strong bg-surface-2 text-muted-foreground hover:border-border-strong"
                }`}
              >
                <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                <span className="line-clamp-2">{s.hook ?? "Untitled script"}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
