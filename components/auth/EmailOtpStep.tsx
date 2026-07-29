"use client";

// The "enter the code we emailed you" step, shared by /signup (right after the
// account is created) and /login (when an unconfirmed account tries to sign
// in). Both verify the SAME token: GoTrue's signup confirmation, which the
// email template renders as a 6-digit code AND as a link — so whichever the
// person reaches for, they land signed in.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";
import { isCompleteOtp } from "@/lib/auth/otp";

export const RESEND_COOLDOWN_SECONDS = 60;

type EmailOtpStepProps = {
  email: string;
  /** Called once the session is live; the page decides where to send them. */
  onVerified: () => void;
  /** Back to the form that collected the email (optional). */
  onChangeEmail?: () => void;
  /**
   * Seconds before "Resend code" unlocks. Pass RESEND_COOLDOWN_SECONDS when a
   * code was just sent (the usual case) — GoTrue rejects a second send inside
   * its own one-per-minute window, so offering the button would only produce
   * an error.
   */
  initialCooldown?: number;
};

export function EmailOtpStep({
  email,
  onVerified,
  onChangeEmail,
  initialCooldown = RESEND_COOLDOWN_SECONDS,
}: EmailOtpStepProps) {
  const dict = useDict();
  const auth = dict.auth;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);
  // Bumped after every rejected code so the field remounts: the boxes come back
  // empty AND focused, so a second try is just "type it again".
  const [attempt, setAttempt] = useState(0);
  // Auto-submit fires the moment the 6th digit lands; this keeps a re-render or
  // a re-paste of the same code from firing a second verify while one is
  // already in flight.
  const inFlight = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (submitted: string) => {
    const token = submitted.trim();
    if (!isCompleteOtp(token) || inFlight.current) return;

    inFlight.current = true;
    setIsLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      // The signup confirmation token — the same one the emailed link carries,
      // just in its 6-digit form.
      type: "signup",
    });

    if (verifyError || !data.session) {
      inFlight.current = false;
      setIsLoading(false);
      setError(
        verifyError ? mapAuthError(verifyError, auth.authErrors, "code") : auth.authErrors.invalidOtp
      );
      // Wrong code: clear the boxes so the next attempt starts clean instead of
      // making them backspace six times.
      setCode("");
      setAttempt((count) => count + 1);
      return;
    }

    // Profile row + signup funnel event, exactly as /auth/callback and
    // /auth/confirm do it. Best-effort on purpose: the session is already
    // valid and the profile row is created by a DB trigger, so a hiccup here
    // must not strand a verified user on the code screen.
    try {
      const response = await fetch("/api/auth/post-signin", { method: "POST" });
      if (!response.ok) {
        console.warn("post-signin bookkeeping failed", response.status);
      }
    } catch (bookkeepingError) {
      console.warn("post-signin bookkeeping threw", bookkeepingError);
    }

    onVerified();
  };

  const handleResend = async () => {
    if (cooldown > 0 || isLoading) return;

    setIsLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      // Keeps the link in the same email pointed at /auth/callback for anyone
      // who clicks instead of typing the code.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setIsLoading(false);
    if (resendError) {
      setError(mapAuthError(resendError, auth.authErrors));
      return;
    }
    setCode("");
    setNotice(auth.codeResent);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground">{auth.verifyEmailHeading}</h2>
      <p className="text-sm text-subtle">
        {auth.verifyEmailBody.replace("{email}", email)}
      </p>

      <OtpCodeInput
        key={attempt}
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error) setError(null);
        }}
        onComplete={(next) => void handleVerify(next)}
        disabled={isLoading}
        invalid={Boolean(error)}
        label={auth.otpInputLabel}
      />

      <Button
        className="w-full"
        onClick={() => void handleVerify(code)}
        disabled={isLoading || !isCompleteOtp(code)}
        type="button"
      >
        {auth.verifyCodeButton}
      </Button>

      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="space-y-1 text-center">
        <p className="text-xs text-subtle">{auth.noCodePrompt}</p>
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={isLoading || cooldown > 0}
          className="text-sm text-accent-brand hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {cooldown > 0
            ? auth.resendCodeCooldown.replace("{seconds}", String(cooldown))
            : auth.resendCodeButton}
        </button>
      </div>

      {onChangeEmail ? (
        <p className="text-center text-sm text-subtle">
          {auth.wrongEmailPrompt}{" "}
          <button type="button" onClick={onChangeEmail} className="text-accent-brand hover:underline">
            {auth.changeEmailLink}
          </button>
        </p>
      ) : null}
    </>
  );
}
