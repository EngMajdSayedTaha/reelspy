import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectToLogin(
  request: NextRequest,
  error: string,
  reason?: string
) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (reason) {
    // Keep it short so it fits comfortably in the URL / UI.
    url.searchParams.set("reason", reason.slice(0, 300));
  }
  return NextResponse.redirect(url);
}

// Project ref is the first label of the Supabase URL host
// (e.g. https://abcdef.supabase.co -> "abcdef"). The PKCE verifier cookie is
// named sb-<ref>-auth-token-code-verifier, so the ref the SERVER computes at
// runtime must match the ref baked into the BROWSER bundle that wrote the
// cookie — otherwise the server looks for a cookie that doesn't exist.
function projectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unparseable";
  }
}

// Compact, value-free snapshot of the cookies that actually reached the server,
// so we can see whether the PKCE verifier survived the OAuth round-trip and
// whether the cookie's project-ref matches the server's runtime ref.
function cookieDiagnostics(request: NextRequest, supabaseUrl: string): string {
  const all = request.cookies.getAll();
  const names = all.map((c) => c.name);
  const verifier = names.find((n) => n.includes("-code-verifier"));
  const refsInCookies = Array.from(
    new Set(
      names
        .map((n) => /^sb-(.+?)-auth-token/.exec(n)?.[1])
        .filter((r): r is string => Boolean(r))
    )
  );
  const runtimeRef = projectRef(supabaseUrl);
  return [
    `verifier=${verifier ? "present" : "MISSING"}`,
    `runtimeRef=${runtimeRef}`,
    `cookieRefs=[${refsInCookies.join(",") || "none"}]`,
    `refMatch=${refsInCookies.length === 0 ? "n/a" : refsInCookies.includes(runtimeRef)}`,
    `totalCookies=${names.length}`,
  ].join(" | ");
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Google / Supabase can bounce back with an explicit error instead of a code
  // (e.g. user denied consent, provider misconfiguration). Surface it instead
  // of masquerading as "missing code".
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription =
    requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error_code");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(request, "supabase_env_missing");
  }

  if (providerError) {
    console.error("OAuth provider returned an error", {
      error: providerError,
      description: providerErrorDescription,
    });
    return redirectToLogin(
      request,
      "oauth_exchange_failed",
      providerErrorDescription ?? providerError
    );
  }

  if (!code) {
    return redirectToLogin(request, "missing_code");
  }

  const supabase = await createClient();

  const diagnostics = cookieDiagnostics(request, supabaseUrl);

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // The real reason almost always points at config (Supabase redirect-URL
    // allowlist / Site URL, a stale PKCE code-verifier cookie, or a mismatched
    // Google client secret). Log it server-side and pass a short hint to the UI.
    console.error("exchangeCodeForSession failed", {
      name: exchangeError.name,
      status: exchangeError.status,
      code: exchangeError.code,
      message: exchangeError.message,
      diagnostics,
    });
    return redirectToLogin(
      request,
      "oauth_exchange_failed",
      `${exchangeError.message} [${diagnostics}]`
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectToLogin(request, "user_not_found", userError?.message);
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
      return redirectToLogin(request, "schema_missing", profileError.message);
    }

    return redirectToLogin(request, "profile_upsert_failed", profileError.message);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
