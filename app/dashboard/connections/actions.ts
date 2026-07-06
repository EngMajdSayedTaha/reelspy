"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveIgConnection } from "@/lib/instagram/connections";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Switch the active IG research connection (X4). The active connection's token
// drives Business Discovery / sync / insights, so switching re-points all of
// research at a different connected IG account. Owner-verified inside
// setActiveIgConnection; fail-open (no-op) if the table isn't there yet.
export async function switchActiveConnection(
  connectionId: string
): Promise<{ ok?: boolean; error?: string }> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).connections;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: dict.unauthorized };

  const admin = createAdminClient();
  const ok = await setActiveIgConnection(admin, user.id, connectionId);
  if (!ok) return { error: dict.couldNotSwitch };

  // Re-point every research surface at the new active connection.
  revalidatePath("/dashboard/connections");
  revalidatePath("/dashboard/feed");
  revalidatePath("/dashboard/my-account");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
