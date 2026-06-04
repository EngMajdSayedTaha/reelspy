"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ScheduledScript = {
  id: string;
  hook: string | null;
  status: string | null;
  scheduled_date: string;
  viral_pattern: string | null;
  platform: string | null;
};

type CalendarViewProps = {
  scripts: ScheduledScript[];
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700",
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

export function CalendarView({ scripts }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<ScheduledScript[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Index scripts by date
  const scriptsByDate = new Map<string, ScheduledScript[]>();
  for (const script of scripts) {
    const date = script.scheduled_date.slice(0, 10);
    const existing = scriptsByDate.get(date) ?? [];
    scriptsByDate.set(date, [...existing, script]);
  }

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

  const handleDayClick = (dateStr: string, dayScripts: ScheduledScript[]) => {
    if (dayScripts.length === 0) return;
    setSelectedDate(dateStr);
    setSelected(dayScripts);
  };

  // Build grid cells: blank slots + day numbers
  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to complete last row
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            ›
          </Button>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-zinc-500">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`blank-${i}`} className="min-h-[72px] rounded-md" />;
          }

          const dateStr = toDateStr(year, month, day);
          const dayScripts = scriptsByDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const hasScripts = dayScripts.length > 0;

          return (
            <div
              key={dateStr}
              onClick={() => handleDayClick(dateStr, dayScripts)}
              className={`min-h-[72px] rounded-md border p-1.5 transition ${
                isToday
                  ? "border-[#F9E400]/40 bg-[#F9E400]/5"
                  : "border-zinc-800 bg-[#0f0f0f]"
              } ${hasScripts ? "cursor-pointer hover:border-zinc-600" : ""}`}
            >
              <p
                className={`text-xs font-medium ${
                  isToday ? "text-[#F9E400]" : "text-zinc-400"
                }`}
              >
                {day}
              </p>
              <div className="mt-1 space-y-0.5">
                {dayScripts.slice(0, 2).map((s) => (
                  <div
                    key={s.id}
                    className={`rounded px-1 py-0.5 text-[10px] leading-tight text-white truncate ${
                      STATUS_COLORS[s.status ?? "draft"] ?? STATUS_COLORS.draft
                    }`}
                  >
                    {s.hook?.slice(0, 25) ?? "Script"}
                  </div>
                ))}
                {dayScripts.length > 2 ? (
                  <p className="text-[10px] text-zinc-500">+{dayScripts.length - 2} more</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selected && selectedDate ? (
        <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium text-white">{selectedDate}</h3>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setSelectedDate(null);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {selected.map((s) => (
              <div key={s.id} className="rounded-md border border-zinc-800 bg-[#0d0d0d] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      s.status === "published"
                        ? "border-emerald-500/50 text-emerald-400"
                        : s.status === "ready"
                        ? "border-blue-500/50 text-blue-400"
                        : "border-zinc-600 text-zinc-400"
                    }`}
                  >
                    {s.status ?? "draft"}
                  </span>
                  {s.viral_pattern ? (
                    <Badge variant="outline" className="text-xs text-[#F9E400] border-[#F9E400]/30">
                      {s.viral_pattern}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-zinc-200">{s.hook ?? "No hook"}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {scripts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-5 text-center text-sm text-zinc-400">
          No scheduled scripts yet. Open a script on the Scripts page and set a date.
        </div>
      ) : null}
    </div>
  );
}
