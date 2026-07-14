import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Reset-password requires an active (recovery) session — verifyOtp in
// /auth/confirm sets it via server cookies before redirecting here, which is
// what makes this link work in a different browser than the one that
// requested it. No session (expired/already-used link, or a direct visit)
// shows the same expired-link state middleware.ts also redirects to.
export default async function ResetPasswordPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const auth = dict.auth;

  const supabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <h2 className="text-lg font-semibold text-foreground">{auth.resetPasswordHeading}</h2>
        <p className="text-sm text-warning">{auth.errors.supabaseEnvMissing}</p>
      </AuthShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell>
        <h2 className="text-lg font-semibold text-foreground">{auth.linkExpiredHeading}</h2>
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">{auth.linkExpiredBody}</p>
          <a href="/forgot-password" className="text-sm text-brand hover:underline">
            {auth.requestNewLinkButton}
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
