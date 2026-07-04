import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDigestToken } from "@/lib/email/digest-token";

// One-click unsubscribe from the weekly digest (V3/W6). GET so it works straight
// from an email link; the HMAC token authorizes the specific user without a
// login. Sets profiles.digest_opt_out = true (idempotent) and returns a small
// confirmation page. Re-subscribe from Settings.

export const runtime = "nodejs";

function page(title: string, body: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0F172A;color:#E2E8F0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
    <div style="max-width:420px;padding:32px;text-align:center">
      <h1 style="font-size:20px;margin:0 0 8px;color:#fff">${title}</h1>
      <p style="font-size:14px;color:#94A3B8;margin:0 0 20px">${body}</p>
      <a href="https://reelspy-one.vercel.app/dashboard/settings" style="display:inline-block;background:#6D28D9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Manage email settings</a>
    </div>
  </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!userId || !verifyDigestToken(userId, token)) {
    return page("Invalid link", "This unsubscribe link is invalid or has expired.");
  }

  try {
    const admin = createAdminClient();
    await admin.from("profiles").update({ digest_opt_out: true }).eq("id", userId);
  } catch {
    return page("Something went wrong", "We couldn't update your preference. Please try again from Settings.");
  }

  return page(
    "You're unsubscribed",
    "You won't receive the weekly ReelSpy digest anymore. You can re-enable it anytime from Settings."
  );
}
