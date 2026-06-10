import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { getMyInsights } from "@/lib/instagram/graph-api";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getIgCredentials(createAdminClient(), user.id).catch(() => null);

  if (!credentials) {
    return NextResponse.json({ connected: false, insights: [] });
  }

  try {
    const insights = await getMyInsights(credentials.igUserId, credentials.token);
    return NextResponse.json({ connected: true, ...insights });
  } catch (error) {
    console.error("IG insights failed", error);
    return NextResponse.json({ error: "Could not load Instagram insights." }, { status: 500 });
  }
}
