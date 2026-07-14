import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Shared helpers for the admin user directory. Email + auth metadata live in the
// GoTrue `auth.users` table, which PostgREST doesn't expose — so they're read
// through the service-role Admin auth API (admin.auth.admin.*), not SQL.

export type AdminAuthUser = {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  createdAt: string | null;
};

// Narrow a GoTrue user object (loosely typed in supabase-js) to what the admin UI
// needs. `banned_until` is present on the admin API's user object but not in the
// public User type, so read it defensively.
export function toAdminAuthUser(u: User | null | undefined): AdminAuthUser | null {
  if (!u) return null;
  const banned = (u as unknown as { banned_until?: string | null }).banned_until ?? null;
  // A past/blank ban timestamp means "not currently banned".
  const bannedUntil = banned && new Date(banned).getTime() > Date.now() ? banned : null;
  return {
    id: u.id,
    email: u.email ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
    bannedUntil,
    createdAt: u.created_at ?? null,
  };
}

// Resolve emails for a page of user ids (≤ per_page rows) in parallel. Missing /
// errored lookups map to null rather than failing the whole list.
export async function resolveEmails(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? null] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );
  return new Map(entries);
}

// Find a single auth user by exact email. GoTrue's JS admin API has no email
// filter, so scan listUsers pages (bounded) and match case-insensitively. Fine
// at current scale; returns null past the cap.
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
  maxPages = 20,
  perPage = 1000
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) break; // last page
  }
  return null;
}

// Content tables owned by a user, with a friendly label — used for the per-user
// content-count breakdown and (indirectly) as the source of truth for what a
// GDPR delete cascades. Token-bearing tables (social_connections, ig_connections)
// are counted but their token columns are never selected.
export const USER_CONTENT_TABLES: { table: string; label: string }[] = [
  { table: "inspiration_accounts", label: "Inspiration accounts" },
  { table: "tracked_reels", label: "Tracked reels" },
  { table: "generated_scripts", label: "Generated scripts" },
  { table: "saved_hooks", label: "Saved hooks" },
  { table: "reel_automations", label: "Reel automations" },
  { table: "dm_automations", label: "DM automations" },
  { table: "youtube_automations", label: "YouTube automations" },
  { table: "publish_posts", label: "Publish posts" },
  { table: "publish_jobs", label: "Publish jobs" },
  { table: "social_connections", label: "Social connections" },
  { table: "ig_connections", label: "IG connections" },
];

export async function contentCounts(
  admin: SupabaseClient,
  userId: string
): Promise<{ table: string; label: string; count: number }[]> {
  return Promise.all(
    USER_CONTENT_TABLES.map(async ({ table, label }) => {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      return { table, label, count: count ?? 0 };
    })
  );
}
