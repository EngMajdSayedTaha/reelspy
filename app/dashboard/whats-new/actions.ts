"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { markReleaseSeen } from "@/lib/release/seen";

/**
 * Records that this user has seen the current release, so the one-time dialog
 * and the sidebar dot both stand down.
 *
 * Never throws: dismissing an informational popup is not worth an error toast,
 * and the failure mode is benign — the dialog simply comes back on the next
 * full page load. `revalidatePath` on the dashboard layout is what clears the
 * dot without a reload.
 */
export async function acknowledgeRelease(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const stored = await markReleaseSeen(supabase, user.id);
    if (stored) revalidatePath("/dashboard", "layout");
  } catch {
    // Fail-open by design — see lib/release/seen.ts.
  }
}
