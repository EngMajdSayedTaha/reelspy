"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { isEmailSendFailure, mapAuthError } from "@/lib/auth/errors";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const dict = useDict();
  const auth = dict.auth;
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const linkExpired = searchParams.get("error") === "link_expired";

  const handleSubmit = async () => {
    if (!isSupabaseConfigured) {
      setError(auth.errors.supabaseEnvMissing);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });

    setIsLoading(false);

    // Anti-enumeration: whether or not the email is registered, show the same
    // generic notice. But a send-side failure is NOT an enumeration signal —
    // it happens regardless of which address was typed — and showing "check
    // your inbox" for a mail that never left the server strands the user and
    // hides a total email outage from us. Surface those.
    if (resetError && (isEmailSendFailure(resetError) || resetError.code === "over_email_send_rate_limit")) {
      setError(mapAuthError(resetError, auth.authErrors));
      return;
    }

    setSent(true);
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold text-foreground">{auth.forgotPasswordHeading}</h2>
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">{auth.resetLinkGenericNotice}</p>
          <a href="/login" className="text-sm text-accent-brand hover:underline">
            {auth.backToLogin}
          </a>
        </div>
      ) : (
        <>
          <p className="text-sm text-subtle">{auth.forgotPasswordDescription}</p>

          {linkExpired ? <p className="text-sm text-warning">{auth.errors.linkExpired}</p> : null}

          <div className="space-y-2">
            <Label htmlFor="email">{auth.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              placeholder={auth.emailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => void handleSubmit()}
            disabled={isLoading || !isSupabaseConfigured || !email}
            type="button"
          >
            {auth.sendResetLinkButton}
          </Button>

          {!isSupabaseConfigured ? (
            <p className="text-sm text-warning">{auth.supabaseMissingWarning}</p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <p className="text-center text-sm text-subtle">
            <a href="/login" className="text-accent-brand hover:underline">
              {auth.backToLogin}
            </a>
          </p>
        </>
      )}
    </AuthShell>
  );
}
