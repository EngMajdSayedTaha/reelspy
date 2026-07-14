"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldAlert, Ban, Trash2, RotateCcw, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { TypeToConfirm } from "@/components/admin/TypeToConfirm";
import { EntitlementsEditor, DEFAULT_CUSTOM } from "@/components/admin/users/EntitlementsEditor";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { Entitlements } from "@/lib/billing/entitlements";

type Detail = {
  profile: {
    id: string;
    username: string | null;
    created_at: string | null;
    is_admin: boolean;
    ig_user_id: string | null;
    ig_token_status: string | null;
    fb_page_name: string | null;
  };
  auth: { email: string | null; lastSignInAt: string | null; bannedUntil: string | null } | null;
  subscription: {
    tier: string;
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    custom_entitlements: Entitlements | null;
  } | null;
  usage: {
    monthly: { action: string; period_month: string; call_count: number }[];
    action: { action: string; window_start: string; call_count: number }[];
  };
  contentCounts: { table: string; label: string; count: number }[];
  recentEvents: { id: number; event: string; props: unknown; created_at: string }[];
  notes: { id: string; note: string; admin_id: string; created_at: string }[];
  connections: {
    social: { id: string; platform: string; username: string | null; token_status: string }[];
    ig: { id: string; username: string | null; token_status: string }[];
  };
};

const TIERS = ["free", "creator", "pro", "studio", "custom"] as const;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export function UserDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Local edit state for the tier override.
  const [tier, setTier] = useState<string>("free");
  const [customEnt, setCustomEnt] = useState<Entitlements>(DEFAULT_CUSTOM);
  const [note, setNote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await requestJson<Detail>(`/api/admin/users/${userId}`);
      setData(res);
      setTier(res.subscription?.tier ?? "free");
      setCustomEnt(res.subscription?.custom_entitlements ?? DEFAULT_CUSTOM);
    } catch (err) {
      notifyError(err, "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, successMsg: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(successMsg);
        await load();
      } catch (err) {
        notifyError(err);
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">User not found.</p>;

  const email = data.auth?.email ?? null;
  const banned = Boolean(data.auth?.bannedUntil);
  const confirmPhrase = email ?? data.profile.username ?? userId;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identity ────────────────────────────────────────────────────── */}
      <Section
        title="Identity"
        action={
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/users/${userId}/view`}>
                <Eye className="h-3.5 w-3.5" /> View as user
              </Link>
            </Button>
            <Button
              variant={data.profile.is_admin ? "secondary" : "outline"}
              size="sm"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    requestJson(`/api/admin/users/${userId}/admin-flag`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ is_admin: !data.profile.is_admin }),
                    }),
                  data.profile.is_admin ? "Admin access revoked" : "Admin access granted"
                )
              }
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {data.profile.is_admin ? "Revoke admin" : "Make admin"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Email">{email ?? "—"}</Field>
          <Field label="Username">{data.profile.username ?? "—"}</Field>
          <Field label="User id"><span className="font-mono text-xs">{userId}</span></Field>
          <Field label="Signed up">{fmt(data.profile.created_at)}</Field>
          <Field label="Last sign-in">{fmt(data.auth?.lastSignInAt ?? null)}</Field>
          <Field label="Status">
            {banned ? (
              <Badge variant="destructive">banned</Badge>
            ) : data.profile.is_admin ? (
              <Badge variant="secondary">admin</Badge>
            ) : (
              <span className="text-success">active</span>
            )}
          </Field>
          <Field label="IG connected">{data.profile.ig_user_id ? `yes (${data.profile.ig_token_status})` : "no"}</Field>
          <Field label="FB page">{data.profile.fb_page_name ?? "—"}</Field>
        </div>
      </Section>

      {/* ── Subscription ────────────────────────────────────────────────── */}
      <Section title="Subscription">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Current tier"><Badge>{data.subscription?.tier ?? "free"}</Badge></Field>
          <Field label="Status">{data.subscription?.status ?? "inactive"}</Field>
          <Field label="Period end">{fmt(data.subscription?.current_period_end ?? null)}</Field>
          <Field label="Cancel at period end">{data.subscription?.cancel_at_period_end ? "yes" : "no"}</Field>
          <Field label="Stripe customer">{data.subscription?.stripe_customer_id ?? "—"}</Field>
          <Field label="Stripe subscription">{data.subscription?.stripe_subscription_id ?? "—"}</Field>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-xs font-medium text-muted-foreground">Override tier (comp / manual grant)</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button
              variant="default"
              size="lg"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    requestJson(`/api/admin/users/${userId}/tier`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tier,
                        custom_entitlements: tier === "custom" ? customEnt : undefined,
                      }),
                    }),
                  "Tier updated"
                )
              }
            >
              Apply tier
            </Button>
          </div>
          {tier === "custom" ? (
            <EntitlementsEditor value={customEnt} onChange={setCustomEnt} />
          ) : null}
        </div>
      </Section>

      {/* ── Usage ───────────────────────────────────────────────────────── */}
      <Section
        title="Usage & limits"
        action={
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => resetUsage(userId, "monthly"), "Monthly usage reset")}>
              <RotateCcw className="h-3.5 w-3.5" /> Monthly
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => resetUsage(userId, "action"), "Action usage reset")}>
              <RotateCcw className="h-3.5 w-3.5" /> Throttles
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Monthly quotas</p>
            {data.usage.monthly.length ? (
              <ul className="space-y-1 text-sm">
                {data.usage.monthly.map((u, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{u.action} <span className="text-xs">({u.period_month})</span></span>
                    <span className="tabular-nums">{u.call_count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No usage recorded.</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Hourly throttles</p>
            {data.usage.action.length ? (
              <ul className="space-y-1 text-sm">
                {data.usage.action.map((u, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{u.action}</span>
                    <span className="tabular-nums">{u.call_count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No throttle state.</p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <Section title="Content">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.contentCounts.map((c) => (
            <Link
              key={c.table}
              href={`/admin/content?resource=${c.table}&user=${userId}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm transition hover:border-primary/30"
            >
              <span className="text-muted-foreground">{c.label}</span>
              <span className="tabular-nums font-medium">{c.count}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* ── Connections ─────────────────────────────────────────────────── */}
      <Section title="Connections">
        {data.connections.social.length === 0 && data.connections.ig.length === 0 ? (
          <p className="text-sm text-muted-foreground">No connections.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.connections.ig.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>IG @{c.username ?? "—"}</span>
                <Badge variant="outline">{c.token_status}</Badge>
              </li>
            ))}
            {data.connections.social.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>{c.platform} @{c.username ?? "—"}</span>
                <Badge variant="outline">{c.token_status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Notes ───────────────────────────────────────────────────────── */}
      <Section title="Support notes">
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || !note.trim()}
            onClick={() =>
              act(async () => {
                await requestJson(`/api/admin/users/${userId}/notes`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ note: note.trim() }),
                });
                setNote("");
              }, "Note added")
            }
          >
            Add
          </Button>
        </div>
        {data.notes.length ? (
          <ul className="mt-3 space-y-2">
            {data.notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                <div>
                  <p className="text-foreground">{n.note}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmt(n.created_at)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        requestJson(`/api/admin/users/${userId}/notes`, {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ noteId: n.id }),
                        }),
                      "Note deleted"
                    )
                  }
                  aria-label="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {/* ── Recent events ───────────────────────────────────────────────── */}
      <Section title="Recent events">
        {data.recentEvents.length ? (
          <ul className="space-y-1.5">
            {data.recentEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{e.event}</span>
                <span className="ms-auto text-xs text-muted-foreground">{fmt(e.created_at)}</span>
                <div className="w-40 shrink-0">
                  <JsonViewer data={e.props} label="props" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No events.</p>
        )}
      </Section>

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <Section title="Danger zone">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={banned ? "outline" : "destructive"}
            size="lg"
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  requestJson(`/api/admin/users/${userId}/ban`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ banned: !banned }),
                  }),
                banned ? "User unbanned" : "User banned"
              )
            }
          >
            <Ban className="h-4 w-4" />
            {banned ? "Unban user" : "Ban user"}
          </Button>
          <Button variant="destructive" size="lg" disabled={busy} onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete user (GDPR)
          </Button>
          {data.subscription?.stripe_customer_id ? (
            <Button variant="outline" size="lg" asChild>
              <a
                href={`https://dashboard.stripe.com/customers/${data.subscription.stripe_customer_id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" /> Stripe customer
              </a>
            </Button>
          ) : null}
        </div>
      </Section>

      <TypeToConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this user permanently?"
        description="This erases the auth user and cascades every owned row (accounts, reels, scripts, automations, connections). Any live Stripe subscription is cancelled first. This cannot be undone."
        confirmPhrase={confirmPhrase}
        confirmLabel="Delete user"
        onConfirm={async (typed) => {
          try {
            await requestJson(`/api/admin/users/${userId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm: typed }),
            });
            toast.success("User deleted");
            window.location.href = "/admin/users";
          } catch (err) {
            notifyError(err);
          }
        }}
      />
    </div>
  );
}

function resetUsage(userId: string, scope: "monthly" | "action") {
  return requestJson(`/api/admin/users/${userId}/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}
