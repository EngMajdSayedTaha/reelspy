import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyInsights } from "@/lib/instagram/graph-api";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("ig_access_token, ig_user_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.ig_access_token || !profile.ig_user_id) {
    return NextResponse.json({ connected: false, insights: [] });
  }

  try {
    const insights = await getMyInsights(profile.ig_user_id, profile.ig_access_token);
    return NextResponse.json({ connected: true, ...insights });
  } catch (error) {
    console.error("IG insights failed", error);
    return NextResponse.json({ error: "Could not load Instagram insights." }, { status: 500 });
  }
}
