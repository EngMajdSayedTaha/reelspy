"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";

const MIN_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const dict = useDict();
  const auth = dict.auth;
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

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

  const handleSignUp = async () => {
    if (!isSupabaseConfigured) {
      setError(auth.errors.supabaseEnvMissing);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(auth.validation.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(auth.validation.passwordsDontMatch);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Mirror the OAuth flow: without this, Supabase falls back to the
        // project's default Site URL, which never resolves through
        // /auth/callback, so the confirmation link's code is silently dropped.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setIsLoading(false);

    if (signUpError) {
      setError(mapAuthError(signUpError, auth.authErrors));
      return;
    }

    if (data.session) {
      // Email confirmation is disabled on this project, so signUp already
      // returned a live session.
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Supabase answers a duplicate signup with a 200 that mimics a fresh one —
    // no session, and even a fabricated `confirmation_sent_at` — but sends no
    // email to an already-confirmed address. An empty `identities` array is the
    // only tell. Without this branch the person sits on "check your email"
    // waiting for a mail that was never sent.
    if ((data.user?.identities?.length ?? 0) === 0) {
      setExistingAccount(true);
      return;
    }

    setCheckEmail(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleResend = async () => {
    if (!isSupabaseConfigured || !email || cooldown > 0) return;
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
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (existingAccount) {
    return (
      <AuthShell>
        <h2 className="text-lg font-semibold text-foreground">{auth.existingAccountHeading}</h2>
        <p className="text-sm text-subtle">{auth.existingAccountBody}</p>

        <Button className="w-full" onClick={() => router.push("/login")} type="button">
          {auth.signInLink}
        </Button>

        <p className="text-center text-sm text-subtle">
          <a href="/forgot-password" className="text-brand hover:underline">
            {auth.forgotPasswordLink}
          </a>
        </p>
      </AuthShell>
    );
  }

  if (checkEmail) {
    return (
      <AuthShell>
        <h2 className="text-lg font-semibold text-foreground">{auth.checkEmailHeading}</h2>
        <p className="text-sm text-subtle">{auth.checkEmailBody}</p>

        <Button
          className="w-full"
          onClick={() => void handleResend()}
          disabled={isLoading || cooldown > 0}
          type="button"
          variant="secondary"
        >
          {cooldown > 0 ? auth.resendEmailCooldown.replace("{seconds}", String(cooldown)) : auth.resendEmailButton}
        </Button>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <p className="text-center text-sm text-subtle">
          {auth.haveAccountPrompt}{" "}
          <a href="/login" className="text-brand hover:underline">
            {auth.signInLink}
          </a>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold text-foreground">{auth.signupHeading}</h2>

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
        <Label htmlFor="password">{auth.passwordLabel}</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{auth.confirmPasswordLabel}</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      <Button
        className="w-full"
        onClick={() => void handleSignUp()}
        disabled={isLoading || !isSupabaseConfigured || !email || !password || !confirmPassword}
        type="button"
        variant="secondary"
      >
        {auth.signUp}
      </Button>

      {!isSupabaseConfigured ? <p className="text-sm text-warning">{auth.supabaseMissingWarning}</p> : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <p className="text-center text-sm text-subtle">
        {auth.haveAccountPrompt}{" "}
        <a href="/login" className="text-brand hover:underline">
          {auth.signInLink}
        </a>
      </p>
    </AuthShell>
  );
}
