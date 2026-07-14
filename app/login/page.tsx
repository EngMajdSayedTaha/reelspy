"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";
import type { AuthDict } from "@/lib/i18n/dictionaries/auth";

function getQueryErrorMap(auth: AuthDict["auth"]): Record<string, string> {
  return {
    missing_code: auth.errors.missingCode,
    oauth_exchange_failed: auth.errors.oauthExchangeFailed,
    user_not_found: auth.errors.userNotFound,
    schema_missing: auth.errors.schemaMissing,
    profile_upsert_failed: auth.errors.profileUpsertFailed,
    supabase_env_missing: auth.errors.supabaseEnvMissing,
    confirm_failed: auth.errors.confirmFailed,
  };
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dict = useDict();
  const auth = dict.auth;
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const authError = searchParams.get("error");
  const authReason = searchParams.get("reason");
  const queryErrorMap = getQueryErrorMap(auth);
  const baseQueryError = authError ? queryErrorMap[authError] ?? null : null;
  const queryError = baseQueryError
    ? authReason
      ? `${baseQueryError} (${authReason})`
      : baseQueryError
    : null;

  const handleOAuth = async () => {
    if (!isSupabaseConfigured) {
      setError(auth.errors.supabaseEnvMissing);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setNotice(null);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // access_type=offline + prompt=consent makes Google return a refresh
        // token (provider_refresh_token), so the session can be renewed without
        // forcing the user through the Google consent screen again.
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setError(auth.errors.supabaseEnvMissing);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    setNeedsConfirmation(false);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(mapAuthError(signInError, auth.authErrors));
      setNeedsConfirmation(signInError.code === "email_not_confirmed");
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleResendConfirmation = async () => {
    if (!isSupabaseConfigured || !email) return;
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setIsLoading(false);
    if (resendError) {
      setError(mapAuthError(resendError, auth.authErrors));
      return;
    }
    setNotice(auth.resendConfirmationSent);
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold text-foreground">{auth.loginHeading}</h2>

      <Button
        className="w-full"
        onClick={() => void handleOAuth()}
        disabled={isLoading || !isSupabaseConfigured}
        type="button"
      >
        {auth.continueWithGoogle}
      </Button>

      <div className="text-center text-xs uppercase tracking-wide text-muted-foreground">{auth.or}</div>

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{auth.passwordLabel}</Label>
          <a href="/forgot-password" className="text-xs text-brand hover:underline">
            {auth.forgotPasswordLink}
          </a>
        </div>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <Button
        className="w-full"
        onClick={() => void handleSignIn()}
        disabled={isLoading || !isSupabaseConfigured || !email || !password}
        type="button"
        variant="secondary"
      >
        {auth.signIn}
      </Button>

      {!isSupabaseConfigured ? <p className="text-sm text-warning">{auth.supabaseMissingWarning}</p> : null}

      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      {error || queryError ? <p className="text-sm text-danger">{error ?? queryError}</p> : null}

      {needsConfirmation ? (
        <div className="space-y-1 text-center">
          <p className="text-xs text-subtle">{auth.resendConfirmationPrompt}</p>
          <button
            type="button"
            onClick={() => void handleResendConfirmation()}
            disabled={isLoading}
            className="text-sm text-brand hover:underline disabled:opacity-50"
          >
            {auth.resendConfirmationButton}
          </button>
        </div>
      ) : null}

      <p className="text-center text-sm text-subtle">
        {auth.noAccountPrompt}{" "}
        <a href="/signup" className="text-brand hover:underline">
          {auth.createAccountLink}
        </a>
      </p>
    </AuthShell>
  );
}
