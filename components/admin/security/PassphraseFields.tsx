"use client";

import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { validateAdminPassphrase } from "@/lib/admin/passphrase-policy";

// New-passphrase + confirm, with the policy shown as you type. Shared by the
// first-time setup form and the rotate form so both enforce — and describe —
// exactly the same rules the server will apply on submit
// (lib/admin/passphrase-policy.ts is the one implementation, imported by both).

export type PassphrasePair = { value: string; confirm: string };

export function passphrasePairReady(pair: PassphrasePair, email?: string | null): boolean {
  return (
    validateAdminPassphrase(pair.value, { email }).valid &&
    pair.confirm.length > 0 &&
    pair.value === pair.confirm
  );
}

export function PassphraseFields({
  pair,
  onChange,
  email,
  disabled,
}: {
  pair: PassphrasePair;
  onChange: (pair: PassphrasePair) => void;
  email?: string | null;
  disabled?: boolean;
}) {
  const check = validateAdminPassphrase(pair.value, { email });
  const touched = pair.value.length > 0;
  const mismatch = pair.confirm.length > 0 && pair.value !== pair.confirm;

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="password"
        autoComplete="new-password"
        disabled={disabled}
        value={pair.value}
        onChange={(event) => onChange({ ...pair, value: event.target.value })}
        placeholder="New admin passphrase"
        aria-label="New admin passphrase"
        className="h-11"
      />
      <Input
        type="password"
        autoComplete="new-password"
        disabled={disabled}
        value={pair.confirm}
        onChange={(event) => onChange({ ...pair, confirm: event.target.value })}
        placeholder="Repeat it"
        aria-label="Repeat the new admin passphrase"
        aria-invalid={mismatch ? true : undefined}
        className="h-11"
      />

      {touched && !check.valid ? (
        <ul className="flex flex-col gap-1">
          {check.problems.map((problem) => (
            <li key={problem} className="flex items-start gap-2 text-xs text-muted-foreground">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>{problem}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {touched && check.valid ? (
        <p className="flex items-center gap-2 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          Strong enough.
        </p>
      ) : null}

      {mismatch ? <p className="text-xs text-destructive">The two entries don&apos;t match.</p> : null}

      <p className="text-xs text-muted-foreground">
        Store it in your password manager. It is hashed, never stored in the clear, and there is no
        &ldquo;email me a reset link&rdquo; path — recovering it needs the service-role key.
      </p>
    </div>
  );
}
