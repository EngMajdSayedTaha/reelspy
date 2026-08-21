import { describe, it, expect } from "vitest";
import { verifyPassphrase } from "@/lib/admin/passphrase";
import { normalizeEnrollmentTicket, sha256Hex } from "@/lib/admin/token";
// The CLI is plain .mjs with no bundler, so it re-implements the hashing and
// ticket format rather than importing them. That duplication is the risk this
// file exists to catch: if the two ever drift, an admin enrolled from the
// terminal can no longer sign in through the browser — and they'd find out at
// the worst possible moment, locked out of their own panel.
import {
  hashPassphrase as cliHashPassphrase,
  randomEnrollmentTicket as cliRandomTicket,
  sha256Hex as cliSha256Hex,
} from "../../scripts/admin-passphrase.mjs";

const SLOW = 20_000;

describe("scripts/admin-passphrase.mjs stays compatible with the app", () => {
  it("writes a hash the app can verify", { timeout: SLOW }, async () => {
    const stored = await cliHashPassphrase("purple mango kettle riverbank");
    expect(await verifyPassphrase("purple mango kettle riverbank", stored)).toBe(true);
    expect(await verifyPassphrase("something else entirely", stored)).toBe(false);
  });

  it("writes it at the app's current cost parameters", { timeout: SLOW }, async () => {
    const stored = await cliHashPassphrase("purple mango kettle riverbank");
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
  });

  it("mints tickets the app accepts and digests identically", () => {
    const ticket = cliRandomTicket();
    expect(normalizeEnrollmentTicket(ticket)).toBe(ticket);
    expect(cliSha256Hex(ticket)).toBe(sha256Hex(ticket));
  });
});
