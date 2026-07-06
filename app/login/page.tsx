"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { AuthDict } from "@/lib/i18n/dictionaries/auth";

function getQueryErrorMap(auth: AuthDict["auth"]): Record<string, string> {
  return {
    missing_code: auth.errors.missingCode,
    oauth_exchange_failed: auth.errors.oauthExchangeFailed,
    user_not_found: auth.errors.userNotFound,
    schema_missing: auth.errors.schemaMissing,
    profile_upsert_failed: auth.errors.profileUpsertFailed,
    supabase_env_missing: auth.errors.supabaseEnvMissing,
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

  const handleEmailAuth = async (mode: "signin" | "signup") => {
    if (!isSupabaseConfigured) {
      setError(auth.errors.supabaseEnvMissing);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const action =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error: authError } = await action;

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    if (mode === "signin") {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(auth.signupSuccessMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* Ambient accent glow */}
      <div className="glow-drift pointer-events-none absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />

      <div className="animate-rise relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark size={48} ariaLabel={dict.shell.logoAlt} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Reel<span className="text-brand">Spy</span>
            </h1>
            <p className="mt-1 text-sm text-subtle">{auth.tagline}</p>
          </div>
        </div>

        <Card className="border-border bg-card text-foreground">
          <CardContent className="space-y-4 pt-6">
          <Button
            className="w-full"
            onClick={handleOAuth}
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
            <Label htmlFor="password">{auth.passwordLabel}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void handleEmailAuth("signin")}
              disabled={isLoading || !isSupabaseConfigured || !email || !password}
              type="button"
            >
              {auth.signIn}
            </Button>
            <Button
              className="flex-1"
              onClick={() => void handleEmailAuth("signup")}
              disabled={isLoading || !isSupabaseConfigured || !email || !password}
              type="button"
              variant="outline"
            >
              {auth.signUp}
            </Button>
          </div>

          {!isSupabaseConfigured ? (
            <p className="text-sm text-warning">
              {auth.supabaseMissingWarning}
            </p>
          ) : null}

          {error || queryError ? (
            <p className="text-sm text-danger">{error ?? queryError}</p>
          ) : null}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-subtle">
          <a href="/terms" className="hover:text-foreground">
            {auth.terms}
          </a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:text-foreground">
            {auth.privacyPolicy}
          </a>
          <span className="mx-2">·</span>
          <a href="/cookies" className="hover:text-foreground">
            {auth.cookiePolicy}
          </a>
        </p>
      </div>
    </div>
  );
}
