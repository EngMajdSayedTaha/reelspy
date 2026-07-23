import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completePostSignIn } from "@/lib/auth/post-signin";
import { relativeRedirect } from "@/lib/http/redirect";

// Open-redirect guard: only allow same-origin relative paths.
function sanitizeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

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
  // Relative redirect: stay on whatever public origin the browser came in on
  // (reelspy.dev) instead of leaking the internal deployment host through the
  // marketing-zone proxy. See lib/http/redirect.ts.
  return relativeRedirect(url);
}

// Value-free snapshot of the cookies/host that reached the server, so the next
// failed attempt tells us WHY the PKCE verifier was missing instead of guessing.
function diagnostics(request: NextRequest): string {
  const names = request.cookies.getAll().map((c) => c.name);
  const hasVerifier = names.some((n) => n.includes("-code-verifier"));
  const hasSession = names.some(
    (n) => /^sb-.+-auth-token(\.\d+)?$/.test(n) && !n.includes("-code-verifier")
  );
  return [
    `host=${request.nextUrl.host}`,
    `verifier=${hasVerifier ? "present" : "MISSING"}`,
    `session=${hasSession ? "present" : "none"}`,
    `cookies=${names.length}`,
  ].join(" | ");
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNext(requestUrl.searchParams.get("next"));

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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // The callback can be hit twice (browser prefetch, a refresh, or a double
    // navigation). The first hit consumes the single-use code AND deletes the
    // PKCE verifier, so the second hit fails with "verifier not found" even
    // though the user is already signed in. If a valid session exists, treat
    // this as success rather than bouncing an authenticated user to /login.
    const {
      data: { user: existingUser },
    } = await supabase.auth.getUser();
    if (existingUser) {
      return relativeRedirect(new URL(next, request.url));
    }

    const diag = diagnostics(request);
    console.error("exchangeCodeForSession failed", {
      name: exchangeError.name,
      status: exchangeError.status,
      code: exchangeError.code,
      message: exchangeError.message,
      diagnostics: diag,
    });
    return redirectToLogin(
      request,
      "oauth_exchange_failed",
      `${exchangeError.message} [${diag}]`
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectToLogin(request, "user_not_found", userError?.message);
  }

  const postSignInError = await completePostSignIn(supabase, user);
  if (postSignInError) {
    return redirectToLogin(request, postSignInError.code, postSignInError.message);
  }

  return relativeRedirect(new URL(next, request.url));
}
