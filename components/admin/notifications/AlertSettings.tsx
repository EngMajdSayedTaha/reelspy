"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestJson, notifyError } from "@/lib/utils/api";
import { cn } from "@/lib/utils";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  SEVERITIES,
  eventsByCategory,
  type Severity,
} from "@/lib/notifications/catalog";
import { SegmentedControl, Toggle } from "@/components/admin/notifications/Toggle";
import type {
  AdminNotificationPrefs,
  DeliveryInfo,
  ResolvedEvent,
  SettingsUpdate,
} from "@/components/admin/notifications/types";

const DIGEST_INTERVALS = [1, 3, 6, 12, 24];
const THROTTLE_CHOICES = [0, 15, 60, 360, 1440];

function throttleLabel(minutes: number): string {
  if (minutes === 0) return "Every one";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  return `${minutes / 1440}d`;
}

export function AlertSettings({
  prefs,
  events,
  delivery,
  onChange,
}: {
  prefs: AdminNotificationPrefs;
  events: ResolvedEvent[];
  delivery: DeliveryInfo;
  onChange: (next: SettingsUpdate) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [flushing, setFlushing] = useState(false);

  // Every control saves on change rather than behind a Save button: these are
  // independent switches, not a form, and a half-saved alerting config that
  // someone forgot to submit is exactly the failure this page exists to avoid.
  const save = async (patch: Record<string, unknown>, key: string) => {
    setSaving(key);
    try {
      const res = await requestJson<SettingsUpdate>("/api/admin/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onChange(res);
      toast.success("Saved");
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(null);
    }
  };

  const addRecipient = async () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email) return;
    if (prefs.recipients.includes(email)) {
      toast.error("That address is already on the list.");
      return;
    }
    await save({ recipients: [...prefs.recipients, email] }, "recipients");
    setNewRecipient("");
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await requestJson<{ recipients: string[] }>("/api/admin/notifications/test", {
        method: "POST",
      });
      toast.success(`Test alert sent to ${res.recipients.join(", ")}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setTesting(false);
    }
  };

  const flushDigest = async () => {
    setFlushing(true);
    try {
      const res = await requestJson<{ message: string }>("/api/admin/notifications/digest", {
        method: "POST",
      });
      toast.success(res.message);
    } catch (err) {
      notifyError(err);
    } finally {
      setFlushing(false);
    }
  };

  const busy = saving !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Where alerts go ─────────────────────────────────────────────── */}
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Email alerts</h2>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  prefs.enabled ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                )}
              >
                {prefs.enabled ? "On" : "Off"}
              </span>
            </div>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {prefs.enabled
                ? "Events you switch on below are emailed to the addresses here. Everything is logged to the inbox either way."
                : "Nothing is being emailed. Alerts are still recorded in the inbox, so you can turn this back on and read what you missed."}
            </p>
          </div>
          <Toggle
            label="Email alerts"
            checked={prefs.enabled}
            busy={saving === "enabled"}
            disabled={busy}
            onChange={(v) => void save({ enabled: v }, "enabled")}
          />
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Recipients</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Up to five addresses. Each gets its own copy — nobody sees who else is on the list.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {prefs.recipients.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-sm text-foreground"
              >
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                {email}
                <button
                  type="button"
                  aria-label={`Remove ${email}`}
                  disabled={busy}
                  onClick={() =>
                    void save(
                      { recipients: prefs.recipients.filter((r) => r !== email) },
                      "recipients"
                    )
                  }
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-background hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {prefs.recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {delivery.effectiveRecipients.length > 0
                  ? `Falling back to ADMIN_ALERT_EMAIL (${delivery.effectiveRecipients.join(", ")}).`
                  : "No recipients and no ADMIN_ALERT_EMAIL — nothing can be emailed yet."}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={newRecipient}
              placeholder="founder@example.com"
              disabled={busy || prefs.recipients.length >= 5}
              onChange={(e) => setNewRecipient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addRecipient();
                }
              }}
              className="h-9 max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy || !newRecipient.trim() || prefs.recipients.length >= 5}
              onClick={() => void addRecipient()}
            >
              {saving === "recipients" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={testing || !delivery.emailConfigured}
              onClick={() => void sendTest()}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send a test
            </Button>
          </div>

          {!delivery.emailConfigured ? (
            <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              No mailer is configured on this deployment. Set <code>RESEND_API_KEY</code> and{" "}
              <code>EMAIL_FROM</code> to actually receive any of this — until then alerts are logged
              to the inbox and nothing is sent.
            </p>
          ) : null}
        </div>
      </section>

      {/* ── How loud ────────────────────────────────────────────────────── */}
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold text-foreground">Volume</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The three dials that decide whether you keep reading these emails in three months.
        </p>

        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <SettingRow
            label="Minimum severity"
            hint="Anything below this is logged to the inbox but never emailed. Start at FYI and raise it if the volume annoys you."
          >
            <SegmentedControl<Severity>
              ariaLabel="Minimum severity"
              value={prefs.minSeverity}
              disabled={busy}
              options={SEVERITIES.map((s) => ({
                value: s,
                label: s === "info" ? "FYI" : s === "warning" ? "Needs a look" : "Act now",
              }))}
              onChange={(v) => void save({ minSeverity: v }, "minSeverity")}
            />
          </SettingRow>

          <SettingRow
            label="Quiet hours"
            hint={
              prefs.quietHours.enabled
                ? `Between ${String(prefs.quietHours.startHour).padStart(2, "0")}:00 and ${String(prefs.quietHours.endHour).padStart(2, "0")}:00 (UTC${prefs.quietHours.utcOffsetMinutes >= 0 ? "+" : ""}${prefs.quietHours.utcOffsetMinutes / 60}) non-urgent alerts wait for the digest. "Act now" alerts always come through.`
                : "Hold non-urgent alerts overnight and let them arrive in the next digest instead."
            }
          >
            <div className="flex items-center gap-2">
              {prefs.quietHours.enabled ? (
                <>
                  <HourInput
                    label="Quiet hours start"
                    value={prefs.quietHours.startHour}
                    disabled={busy}
                    onCommit={(v) => void save({ quietHours: { startHour: v } }, "quietHours")}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <HourInput
                    label="Quiet hours end"
                    value={prefs.quietHours.endHour}
                    disabled={busy}
                    onCommit={(v) => void save({ quietHours: { endHour: v } }, "quietHours")}
                  />
                </>
              ) : null}
              <Toggle
                label="Quiet hours"
                checked={prefs.quietHours.enabled}
                busy={saving === "quietHours"}
                disabled={busy}
                onChange={(v) => void save({ quietHours: { enabled: v } }, "quietHours")}
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Digest"
            hint={
              prefs.digest.enabled
                ? `Batched alerts arrive every ${prefs.digest.intervalHours}h in one email.${
                    delivery.lastDigestAt
                      ? ` Last sent ${new Date(delivery.lastDigestAt).toLocaleString()}.`
                      : " Not sent yet."
                  }`
                : "With the digest off, everything routed to it is emailed immediately instead — nothing is dropped."
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {prefs.digest.enabled ? (
                <>
                  <SegmentedControl<number>
                    ariaLabel="Digest interval"
                    value={prefs.digest.intervalHours}
                    disabled={busy}
                    options={DIGEST_INTERVALS.map((h) => ({ value: h, label: `${h}h` }))}
                    onChange={(v) => void save({ digest: { intervalHours: v } }, "digest")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={flushing}
                    onClick={() => void flushDigest()}
                  >
                    {flushing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Send now
                  </Button>
                </>
              ) : null}
              <Toggle
                label="Digest"
                checked={prefs.digest.enabled}
                busy={saving === "digest"}
                disabled={busy}
                onChange={(v) => void save({ digest: { enabled: v } }, "digest")}
              />
            </div>
          </SettingRow>
        </div>
      </section>

      {/* ── What to alert on ────────────────────────────────────────────── */}
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold text-foreground">What to alert on</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Per event: whether it alerts at all, whether it interrupts you or waits for the digest, and
          how often the same thing may alert twice.
        </p>

        <div className="mt-4 flex flex-col gap-6">
          {eventsByCategory().map(({ category }) => {
            const rows = events.filter((e) => e.category === category);
            if (rows.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[category]}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORY_HINTS[category]}</p>
                <div className="mt-3 divide-y divide-border rounded-lg ring-1 ring-border">
                  {rows.map((event) => (
                    <EventRow
                      key={event.key}
                      event={event}
                      busy={busy}
                      saving={saving === event.key}
                      onChange={(patch) => void save({ events: { [event.key]: patch } }, event.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

// Uncommitted local state so typing "1" on the way to "14" doesn't fire a save
// per keystroke; the value is pushed on blur or Enter.
function HourInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) {
      setDraft(String(value));
      return;
    }
    const hour = Math.trunc(parsed);
    if (hour !== value) onCommit(hour);
  };

  return (
    <Input
      type="number"
      min={0}
      max={23}
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-8 w-16"
    />
  );
}

function EventRow({
  event,
  busy,
  saving,
  onChange,
}: {
  event: ResolvedEvent;
  busy: boolean;
  saving: boolean;
  onChange: (patch: { enabled?: boolean; digest?: boolean; throttleMinutes?: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 p-3">
      <div className="min-w-[220px] flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium", event.enabled ? "text-foreground" : "text-muted-foreground")}>
            {event.label}
          </p>
          <SeverityChip severity={event.severity} />
        </div>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{event.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<string>
          ariaLabel={`${event.label} routing`}
          value={event.digest ? "digest" : "instant"}
          disabled={busy || !event.enabled}
          options={[
            { value: "instant", label: "Instant", hint: "Emailed on every occurrence" },
            { value: "digest", label: "Digest", hint: "Batched into the periodic roll-up" },
          ]}
          onChange={(v) => onChange({ digest: v === "digest" })}
        />
        <SegmentedControl<number>
          ariaLabel={`${event.label} repeat window`}
          value={event.throttleMinutes}
          disabled={busy || !event.enabled}
          options={THROTTLE_CHOICES.map((m) => ({
            value: m,
            label: throttleLabel(m),
            hint:
              m === 0
                ? "Never suppress repeats"
                : `Fold repeats of the same thing within ${throttleLabel(m)} into one alert`,
          }))}
          onChange={(v) => onChange({ throttleMinutes: v })}
        />
        <Toggle
          label={event.label}
          size="sm"
          checked={event.enabled}
          busy={saving}
          disabled={busy}
          onChange={(v) => onChange({ enabled: v })}
        />
      </div>
    </div>
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const styles =
    severity === "critical"
      ? "bg-destructive/15 text-destructive"
      : severity === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-secondary text-muted-foreground";
  const label = severity === "critical" ? "Act now" : severity === "warning" ? "Needs a look" : "FYI";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles)}>
      {label}
    </span>
  );
}
