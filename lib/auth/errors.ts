// Maps a raw Supabase Auth error to a friendly, translated message. Supabase's
// own error.message text is developer-facing English and leaks implementation
// details, so every call site should go through this instead of surfacing
// error.message directly. Keyed on error.code — see
// https://supabase.com/docs/guides/auth/debugging/error-codes.

import type { AuthError } from "@supabase/supabase-js";
import type { AuthDict } from "@/lib/i18n/dictionaries/auth";

type AuthErrorDict = AuthDict["auth"]["authErrors"];

export function mapAuthError(error: Pick<AuthError, "code" | "message">, dict: AuthErrorDict): string {
  const code = error.code ?? "";
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
    case "user_not_found":
      // Anti-enumeration: callers should generally avoid surfacing these
      // distinctly, but keep a safe generic fallback in case one leaks through.
      return dict.generic;
    default:
      return dict.generic;
  }
}
