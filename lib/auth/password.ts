// Shared strong-password policy for signup and password reset (voluntary and
// admin-forced). This is the app's client/server-shared enforcement boundary;
// it does not replace Supabase Auth's own minimum-length setting (Supabase
// dashboard → Authentication → Policies → Password Requirements), which
// should be raised to match so a direct API call can't bypass this file.
import type { AuthDict } from "@/lib/i18n/dictionaries/auth";

export const PASSWORD_MIN_LENGTH = 10;

export type PasswordIssue =
  | "length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol"
  | "common"
  | "containsEmail";

export type PasswordCheck = {
  valid: boolean;
  issues: PasswordIssue[];
};

// A small blocklist of the most-guessed passwords/patterns — not exhaustive
// (that needs a breached-password API), just enough to stop the obvious ones
// that would otherwise satisfy every character-class rule below (e.g.
// "Password1!").
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password1!", "password123", "12345678", "123456789",
  "1234567890", "qwerty123", "qwertyuiop", "letmein123", "welcome123", "admin1234",
  "iloveyou1", "111111111", "123123123", "abcd1234", "changeme1", "trustno1",
  "football1", "baseball1", "dragon123", "monkey123", "sunshine1", "princess1",
]);

export function validatePassword(
  password: string,
  context: { email?: string | null } = {}
): PasswordCheck {
  const issues: PasswordIssue[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) issues.push("length");
  if (!/[A-Z]/.test(password)) issues.push("uppercase");
  if (!/[a-z]/.test(password)) issues.push("lowercase");
  if (!/[0-9]/.test(password)) issues.push("number");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("symbol");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("common");

  const localPart = context.email?.split("@")[0]?.toLowerCase().trim();
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    issues.push("containsEmail");
  }

  return { valid: issues.length === 0, issues };
}

type ValidationDict = AuthDict["auth"]["validation"];

// Renders every unmet rule as one localized sentence, in a stable order —
// used by SignupForm/ResetPasswordForm to show all failures at once instead
// of forcing the user through one-at-a-time resubmits.
export function describePasswordIssues(issues: PasswordIssue[], dict: ValidationDict): string[] {
  return issues.map((issue) => dict.passwordIssues[issue]);
}
