// One-time-code helpers shared by the signup and sign-in verification steps.
//
// Supabase/GoTrue mails a 6-digit numeric code (`{{ .Token }}` in the auth
// email templates — see docs/email-templates.md) alongside the confirmation
// link. The six input boxes are presentation only: every edit is reduced here,
// against ONE string, so typing, pasting and backspacing can't drift from what
// the submit guard sees.

export const OTP_LENGTH = 6;

/**
 * Digits only, capped at OTP_LENGTH. Survives everything a real person pastes:
 * "123456", "123 456", "123-456", and the whole sentence out of the email
 * ("Your ReelSpy code is 123456") — the digits are kept in order, the rest is
 * dropped.
 */
export function normalizeOtp(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtp(value: string): boolean {
  return normalizeOtp(value).length === OTP_LENGTH;
}

/** The code after an edit, plus which box should hold focus next. */
export type OtpEdit = { value: string; caret: number };

// Digits land ON boxes, they don't push the rest along: writing into box 3
// replaces box 3 (and, for a multi-digit insert, the boxes after it) rather
// than shifting a full code sideways.
function overwriteAt(value: string, index: number, digits: string): string {
  return normalizeOtp(value.slice(0, index) + digits + value.slice(index + digits.length));
}

/**
 * A box reported a new value. `raw` is the box's whole content, which is one
 * digit for ordinary typing (the box selects itself on focus, so the keystroke
 * replaces what was there) but can be longer when the caret was placed after
 * the existing digit, when an Android keyboard batches keystrokes, or when the
 * OS autofills the code into the first box.
 */
export function applyOtpInput(value: string, index: number, raw: string): OtpEdit {
  let digits = normalizeOtp(raw);

  // "1" was already in the box and the browser handed back "12": the keystroke
  // was appended, not substituted. Drop the digit we already had.
  const existing = value[index];
  if (digits.length > 1 && existing && digits.startsWith(existing)) {
    digits = digits.slice(1);
  }

  if (!digits) {
    // Emptied by a composition/IME delete that never fires a keydown.
    return { value: normalizeOtp(value.slice(0, index) + value.slice(index + 1)), caret: index };
  }

  return { value: overwriteAt(value, index, digits), caret: index + digits.length };
}

/** Backspace: clear this box if it holds a digit, otherwise eat the one before. */
export function applyOtpBackspace(value: string, index: number): OtpEdit {
  if (value[index]) {
    return { value: normalizeOtp(value.slice(0, index) + value.slice(index + 1)), caret: index };
  }
  const previous = Math.max(0, index - 1);
  return {
    value: normalizeOtp(value.slice(0, previous) + value.slice(index)),
    caret: previous,
  };
}

/**
 * Paste. A full-length paste fills the code from the start whichever box was
 * focused — that is what someone copying the whole code expects — while a
 * partial paste drops in at the focused box. Returns null when the clipboard
 * held no digits at all, so the caller can leave the field untouched.
 */
export function applyOtpPaste(value: string, index: number, pasted: string): OtpEdit | null {
  const digits = normalizeOtp(pasted);
  if (!digits) return null;

  const start = digits.length === OTP_LENGTH ? 0 : index;
  return { value: overwriteAt(value, start, digits), caret: start + digits.length };
}
