import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { contentCounts } from "@/lib/admin/users";

export const metadata = { title: "View as user · Admin" };

// Read-only "view as user": renders a snapshot of the user's own data (fetched
// service-role) inside the admin shell. NO session impersonation — this is a
// support-visibility tool, so there is no way to act as the user or write on
// their behalf. The visit is audited (user.view_as).
export default async function ViewAsUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, user, ip, userAgent } = await requireAdminPage();

  const [profileR, subR, counts, reelsR, scriptsR, usageR] = await Promise.all([
    admin.from("profiles").select("username, created_at, ig_user_id, brand_voice").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("tier, status, current_period_end").eq("user_id", id).maybeSingle(),
    contentCounts(admin, id),
    admin
      .from("tracked_reels")
      .select("id, ig_permalink, caption, view_count, like_count, transcript_status, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("generated_scripts")
      .select("id, hook, platform, status, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("user_monthly_usage").select("action, period_month, call_count").eq("user_id", id).order("period_month", { ascending: false }),
  ]);

  if (!profileR.data) notFound();

  // Log the view (best-effort; won't block the render).
  await writeAudit(admin, {
    adminId: user.id,
    action: "user.view_as",
    targetType: "user",
    targetId: id,
    payload: { username: profileR.data.username ?? null },
    ip,
    userAgent,
  });

  const username = (profileR.data.username as string | null) ?? id;
  const reels = (reelsR.data ?? []) as { id: string; ig_permalink: string; caption: string | null; view_count: number; like_count: number; transcript_status: string; created_at: string }[];
  const scripts = (scriptsR.data ?? []) as { id: string; hook: string | null; platform: string; status: string; created_at: string }[];
  const usage = (usageR.data ?? []) as { action: string; period_month: string; call_count: number }[];
  const sub = subR.data as { tier: string; status: string; current_period_end: string | null } | null;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/admin/users/${id}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to user
      </Link>

      <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-warning">
        <Eye className="h-4 w-4" />
        <span className="text-sm font-medium">Viewing as @{username} (read-only)</span>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-4">
        {counts.map((c) => (
          <div key={c.table} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <span className="text-lg font-semibold tabular-nums text-foreground">{c.count}</span>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Tier</span>
          <span className="text-lg font-semibold text-foreground">{sub?.tier ?? "free"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent tracked reels
          </h2>
          {reels.length ? (
            <ul className="space-y-2">
              {reels.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={r.ig_permalink} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
                    {r.caption?.slice(0, 48) || r.ig_permalink}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {r.view_count.toLocaleString()} views
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No reels.</p>
          )}
        </section>

        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent scripts
          </h2>
          {scripts.length ? (
            <ul className="space-y-2">
              {scripts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-foreground">{s.hook?.slice(0, 48) || "(untitled)"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No scripts.</p>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Monthly usage
        </h2>
        {usage.length ? (
          <ul className="space-y-1 text-sm">
            {usage.map((u, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-muted-foreground">
                  {u.action} <span className="text-xs">({u.period_month})</span>
                </span>
                <span className="tabular-nums">{u.call_count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No usage recorded.</p>
        )}
      </section>
    </div>
  );
}
