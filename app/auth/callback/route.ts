import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/login?error=supabase_env_missing", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange_failed", request.url));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login?error=user_not_found", request.url));
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: user.email,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Profile upsert failed", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    });

    if (profileError.code === "PGRST205") {
      return NextResponse.redirect(new URL("/login?error=schema_missing", request.url));
    }

    return NextResponse.redirect(new URL("/login?error=profile_upsert_failed", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
