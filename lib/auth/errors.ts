// Maps a raw Supabase Auth error to a friendly, translated message. Supabase's
// own error.message text is developer-facing English and leaks implementation
// details, so every call site should go through this instead of surfacing
// error.message directly. Keyed on error.code — see
// https://supabase.com/docs/guides/auth/debugging/error-codes.

import type { AuthError } from "@supabase/supabase-js";
import type { AuthDict } from "@/lib/i18n/dictionaries/auth";

type AuthErrorDict = AuthDict["auth"]["authErrors"];

type RawAuthError = Pick<AuthError, "code" | "message"> & { status?: number };

// True when Auth accepted the request but the mail provider refused it — bad
// SMTP credentials, unverified sending domain, provider outage. GoTrue reports
// these as a 500 with an `error_sending_*` code (older versions: a bare
// `unexpected_failure` whose message is "Error sending recovery email").
//
// This is worth its own branch because it is the one auth failure the *user*
// cannot fix by retrying, and the one an operator must hear about immediately:
// a silent version of it means every signup and reset on the platform is dead.
export function isEmailSendFailure(error: RawAuthError): boolean {
  const code = error.code ?? "";
  if (code.startsWith("error_sending_")) return true;
  if (code === "email_provider_disabled") return true;
  return (error.status ?? 0) >= 500 && /error sending/i.test(error.message ?? "");
}

export function mapAuthError(error: RawAuthError, dict: AuthErrorDict): string {
  const code = error.code ?? "";
  if (isEmailSendFailure(error)) {
    return dict.emailSendFailed;
  }
  switch (code) {
    case "invalid_credentials":
      return dict.invalidCredentials;
    case "email_not_confirmed":
      return dict.emailNotConfirmed;
    case "weak_password":
      return dict.weakPassword;
    case "same_password":
      return dict.samePassword;
    case "otp_expired":
      return dict.otpExpired;
    case "over_email_send_rate_limit":
      return dict.overEmailSendRateLimit;
    case "user_already_exists":
      // Deliberate product decision: we tell people their email is taken rather
      // than leave them staring at a "check your inbox" screen for a mail that
      // will never come. It does confirm account existence, but /login already
      // does that via "Incorrect email or password".
      return dict.userAlreadyExists;
    case "user_not_found":
      // Still anti-enumeration: password reset must not reveal who has an
      // account, since anyone can trigger it for any address.
      return dict.generic;
    default:
      return dict.generic;
  }
}
