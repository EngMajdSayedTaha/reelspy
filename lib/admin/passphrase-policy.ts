// The admin passphrase strength policy — pure, dependency-free, and safe on the
// client so the setup and rotate forms can show every unmet rule as you type
// while the server enforces exactly the same function on submit. The hashing
// half lives in lib/admin/passphrase.ts, which is server-only.

/**
 * Longer than the account-password minimum (10, see lib/auth/password.ts) on
 * purpose: this one secret stands between a stolen session and every
 * customer's data, and unlike a login password it is typed a handful of times
 * a day, not constantly.
 */
export const ADMIN_PASSPHRASE_MIN_LENGTH = 14;

/** Beyond this length a long human passphrase needs no character-class mix. */
const LONG_PASSPHRASE_LENGTH = 24;

// Deliberately passphrase-friendly: four random words beat "Adm1n!23" and are
// far easier to type correctly under pressure, so length alone satisfies the
// policy past LONG_PASSPHRASE_LENGTH.

// The shapes an admin actually reaches for when told "pick an admin password".
// Not a breach corpus — just the guesses an attacker makes first.
const BANNED_FRAGMENTS = [
  "reelspy",
  "admin",
  "password",
  "passphrase",
  "letmein",
  "qwerty",
  "123456",
  "founder",
  "superuser",
  "changeme",
];

export type PassphraseCheck = { valid: boolean; problems: string[] };

/**
 * The whole policy in one call. Returns every unmet rule at once (the admin UI
 * shows them together) rather than failing one at a time.
 *
 * `accountPassword` is only ever passed on the client, where the admin may be
 * typing both into the same form — the server never receives it. Reusing the
 * account password here would collapse two factors back into one.
 */
export function validateAdminPassphrase(
  passphrase: string,
  context: { email?: string | null; accountPassword?: string | null } = {}
): PassphraseCheck {
  const problems: string[] = [];
  const value = passphrase.normalize("NFKC");

  if (value.length < ADMIN_PASSPHRASE_MIN_LENGTH) {
    problems.push(`Use at least ${ADMIN_PASSPHRASE_MIN_LENGTH} characters.`);
  }
  if (value !== value.trim()) {
    problems.push("Remove the leading or trailing spaces — they are easy to lose when retyping.");
  }

  if (value.length < LONG_PASSPHRASE_LENGTH) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
    if (classes < 3) {
      problems.push(
        `Mix at least three of: lowercase, uppercase, digits, symbols — or use ${LONG_PASSPHRASE_LENGTH}+ characters instead.`
      );
    }
  }

  const lowered = value.toLowerCase();
  if (BANNED_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    problems.push("Don't build it around an obvious word like \"admin\", \"password\" or the product name.");
  }

  // "aaaaaaaaaaaaaa" and "abababababababab" pass a length check and nothing else.
  if (/^(.)\1+$/.test(value) || new Set(value).size < 5) {
    problems.push("Too repetitive — use more distinct characters.");
  }

  const localPart = context.email?.split("@")[0]?.toLowerCase().trim();
  if (localPart && localPart.length >= 3 && lowered.includes(localPart)) {
    problems.push("Don't include your email address in it.");
  }

  if (context.accountPassword && value === context.accountPassword.normalize("NFKC")) {
    problems.push("This is your account password. The admin passphrase must be a different secret.");
  }

  return { valid: problems.length === 0, problems };
}
