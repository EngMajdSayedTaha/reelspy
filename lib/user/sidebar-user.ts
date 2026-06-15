import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { readMyInsightsCache } from "@/lib/instagram/my-insights";

export type SidebarUser = {
  /** "@handle" when an IG account is connected, else the profile name/email. */
  handle: string;
  /** IG profile picture, when available and cached. */
  avatarUrl: string | null;
  email: string | null;
  connected: boolean;
};

/**
 * Lightweight identity for the sidebar: the user's Instagram handle + avatar
 * when connected, otherwise their profile username/email. Reads only the cached
 * insights payload (no live Graph round-trip) so every dashboard render stays
 * cheap.
 */
export async function getSidebarUser(): Promise<SidebarUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);
  const connected = Boolean(credentials);

  let igUsername: string | null = null;
  let avatarUrl: string | null = null;
  if (connected) {
    const cached = await readMyInsightsCache(admin, user.id).catch(() => null);
    if (cached) {
      igUsername = cached.payload.profile.username || null;
      avatarUrl = cached.payload.profile.profile_picture_url || null;
    }
  }

  const handle = igUsername
    ? `@${igUsername}`
    : profile?.username ?? user.email ?? "Account";

  return { handle, avatarUrl, email: user.email ?? null, connected };
}
