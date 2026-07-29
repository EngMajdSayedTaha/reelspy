import { describe, it, expect } from "vitest";
import { isEmailSendFailure, mapAuthError } from "@/lib/auth/errors";
import { authEn } from "@/lib/i18n/dictionaries/auth";

const dict = authEn.auth.authErrors;

describe("isEmailSendFailure", () => {
  // The shape GoTrue actually returned when Supabase's SMTP password went stale
  // and every password reset died: HTTP 500, "Error sending recovery email".
  it("catches a 500 whose message names a failed send", () => {
    expect(
      isEmailSendFailure({
        code: "unexpected_failure",
        message: "Error sending recovery email",
        status: 500,
      }),
    ).toBe(true);
  });

  it("catches the explicit error_sending_* codes", () => {
    expect(
      isEmailSendFailure({ code: "error_sending_confirmation_email", message: "", status: 500 }),
    ).toBe(true);
  });

  it("does not mistake ordinary auth failures for send failures", () => {
    expect(
      isEmailSendFailure({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 }),
    ).toBe(false);
    // A 500 unrelated to mail must stay generic, not blame the mail provider.
    expect(isEmailSendFailure({ code: "unexpected_failure", message: "Database error", status: 500 })).toBe(false);
  });
});

describe("mapAuthError", () => {
  it("tells the user a send failure is our fault, not theirs", () => {
    const message = mapAuthError(
      { code: "unexpected_failure", message: "Error sending recovery email", status: 500 },
      dict,
    );
    expect(message).toBe(dict.emailSendFailed);
    expect(message).not.toBe(dict.generic);
  });

  it("still maps the everyday codes", () => {
    expect(mapAuthError({ code: "invalid_credentials", message: "" }, dict)).toBe(dict.invalidCredentials);
    expect(mapAuthError({ code: "over_email_send_rate_limit", message: "" }, dict)).toBe(dict.overEmailSendRateLimit);
    expect(mapAuthError({ code: "something_new", message: "" }, dict)).toBe(dict.generic);
  });

  it("names the surface the one-time token came from", () => {
    // GoTrue sends otp_expired for an emailed link AND for a typed code, so the
    // caller says which noun the reader is looking at.
    const rejected = { code: "otp_expired", message: "Token has expired or is invalid" };
    expect(mapAuthError(rejected, dict)).toBe(dict.otpExpired);
    expect(mapAuthError(rejected, dict, "link")).toBe(dict.otpExpired);
    expect(mapAuthError(rejected, dict, "code")).toBe(dict.invalidOtp);
  });

  it("never says whether a rejected code was wrong or merely expired", () => {
    // Telling them apart would hand a guesser a hit/miss oracle.
    expect(dict.invalidOtp).toMatch(/wrong or has expired/i);
    expect(mapAuthError({ code: "otp_expired", message: "" }, dict, "code")).not.toBe(dict.generic);
  });

  it("separates too-many-attempts from too-many-emails", () => {
    expect(mapAuthError({ code: "over_request_rate_limit", message: "" }, dict)).toBe(dict.overRequestRateLimit);
    expect(mapAuthError({ code: "over_email_send_rate_limit", message: "" }, dict)).toBe(dict.overEmailSendRateLimit);
  });

  it("names a taken email, but never reveals an unknown one", () => {
    expect(mapAuthError({ code: "user_already_exists", message: "" }, dict)).toBe(dict.userAlreadyExists);
    // Password reset is triggerable by anyone for any address, so this one must
    // stay generic or it becomes an account-enumeration oracle.
    expect(mapAuthError({ code: "user_not_found", message: "" }, dict)).toBe(dict.generic);
  });
});
