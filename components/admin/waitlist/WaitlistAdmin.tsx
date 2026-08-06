"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, ListChecks, TrendingUp, UserCheck } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestJson, notifyError } from "@/lib/utils/api";
import {
  WaitlistSettingsCard,
  type WaitlistFlagState,
} from "@/components/admin/waitlist/WaitlistSettingsCard";
import { WaitlistTable, type WaitlistStats } from "@/components/admin/waitlist/WaitlistTable";

// /admin/waitlist — the switch, the counters, the queue, and a way to add
// someone by hand. One page, because in practice they're one job: decide who
// gets in this week.
export function WaitlistAdmin() {
  const [flag, setFlag] = useState<WaitlistFlagState | null>(null);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const signal = { cancelled: false };
    (async () => {
      try {
        const res = await requestJson<{ flag: WaitlistFlagState }>("/api/admin/waitlist/settings");
        if (!signal.cancelled) setFlag(res.flag);
      } catch (err) {
        if (!signal.cancelled) notifyError(err, "Failed to load waitlist settings.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, []);

  // Stable identity so it isn't a new function on every render — the table
  // calls it from inside its fetch effect.
  const onStats = useCallback((next: WaitlistStats) => setStats(next), []);

  if (loading) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="flex flex-col gap-6">
      {flag ? <WaitlistSettingsCard flag={flag} onChange={setFlag} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On the list"
          value={stats?.total ?? "—"}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Pending"
          value={stats?.pending ?? "—"}
          tone={stats && stats.pending > 0 ? "warning" : "default"}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Approved"
          value={stats?.approved ?? "—"}
          tone="success"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Joined (7d)"
          value={stats?.last7d ?? "—"}
          hint="New entries this week"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <WaitlistTable onStats={onStats} />

      <AddByHand />
    </div>
  );
}

// Meeting a creator at an event and wanting them in (or straight in) is a real
// workflow, and doing it through the database is not. Same idempotent path as
// the public form, so re-adding an existing address updates rather than errors.
function AddByHand() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (approve: boolean) => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await requestJson<{ created: boolean }>("/api/admin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, approve }),
      });
      toast.success(res.created ? (approve ? "Added and approved" : "Added") : "Already on the list — updated");
      setEmail("");
      setName("");
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Add someone by hand</h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="creator@example.com"
          className="sm:max-w-xs"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="sm:max-w-xs"
        />
        <Button variant="secondary" size="lg" disabled={busy || !email} onClick={() => void add(false)}>
          Add to list
        </Button>
        <Button size="lg" disabled={busy || !email} onClick={() => void add(true)}>
          Add &amp; approve
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Approving here grants access to that email address — they can sign up (or sign in) with it and go
        straight into the product.
      </p>
    </div>
  );
}
