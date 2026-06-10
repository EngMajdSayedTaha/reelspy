import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears the stored Instagram token so the user can reconnect cleanly.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  await supabase
    .from("profiles")
    .update({
      ig_access_token: null,
      ig_user_id: null,
      ig_token_expires_at: null,
      ig_token_status: "active",
      ig_token_refreshed_at: null,
    })
    .eq("id", user.id);

  return NextResponse.redirect(
    new URL("/dashboard/settings/instagram?success=disconnected", request.url)
  );
}
