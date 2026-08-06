"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { EmailOtpStep } from "@/components/auth/EmailOtpStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";

const MIN_PASSWORD_LENGTH = 8;

// Extracted from app/signup/page.tsx so that page can become a server
// component and read the waiting-list flag before deciding what to render.
// The markup and behaviour are unchanged.
//
// `defaultEmail` is set only when app/signup/page.tsx has already verified
// (server-side, against waitlist_entries) that this exact address is
// approved — see isEmailApproved(). The field is locked rather than merely
// prefilled: editing it to some other address would create the account under
// an email the waitlist gate has never approved, landing them right back on
// /waitlist confused about why "approved" didn't work. The approval email's
// own copy already tells people to use this exact address, so the lock just
// enforces what they were already told.
export function SignupForm({ defaultEmail }: { defaultEmail?: string } = {}) {
  return (
    <Suspense fallback={null}>
      <SignupFormInner defaultEmail={defaultEmail} />
    </Suspense>
  );
}

function SignupFormInner({ defaultEmail }: { defaultEmail?: string }) {
  const router = useRouter();
  const dict = useDict();
  const auth = dict.auth;
  const waitlist = dict.waitlist;
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const emailLocked = Boolean(defaultEmail);

  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
        // The confirmation email carries a 6-digit code (verified below on the
        // code screen) AND a link, for whoever clicks instead of typing. This
        // keeps the link pointed at /auth/callback: without it Supabase falls
        // back to the project's default Site URL, which never resolves through
        // the callback, so the link's code is silently dropped.
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
    // only tell. Without this branch the person sits on the code screen waiting
    // for a mail that was never sent.
    if ((data.user?.identities?.length ?? 0) === 0) {
      setExistingAccount(true);
      return;
    }

    setAwaitingCode(true);
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
          <a href="/forgot-password" className="text-accent-brand hover:underline">
            {auth.forgotPasswordLink}
          </a>
        </p>
      </AuthShell>
    );
  }

  if (awaitingCode) {
    return (
      <AuthShell>
        <EmailOtpStep
          email={email}
          onVerified={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          onChangeEmail={() => setAwaitingCode(false)}
        />
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
          readOnly={emailLocked}
          className={emailLocked ? "cursor-not-allowed opacity-80" : undefined}
        />
        {emailLocked ? (
          <p className="text-xs text-subtle">{waitlist.approvedEmailLocked}</p>
        ) : null}
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
        <a href="/login" className="text-accent-brand hover:underline">
          {auth.signInLink}
        </a>
      </p>
    </AuthShell>
  );
}
