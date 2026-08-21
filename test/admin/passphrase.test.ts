import { describe, it, expect } from "vitest";
import { hashPassphrase, needsRehash, verifyPassphrase } from "@/lib/admin/passphrase";
import { validateAdminPassphrase } from "@/lib/admin/passphrase-policy";
import { digestsMatch, normalizeEnrollmentTicket, randomEnrollmentTicket, sha256Hex } from "@/lib/admin/token";

// scrypt at production parameters is ~100ms a call, and several tests hash
// twice, so give the suite room rather than tuning the cost down — testing a
// weaker hash than we ship would defeat the point.
const SLOW = 20_000;

describe("hashPassphrase / verifyPassphrase", () => {
  it("round-trips the correct passphrase", { timeout: SLOW }, async () => {
    const stored = await hashPassphrase("correct horse battery staple");
    expect(await verifyPassphrase("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong passphrase", { timeout: SLOW }, async () => {
    const stored = await hashPassphrase("correct horse battery staple");
    expect(await verifyPassphrase("correct horse battery stapl", stored)).toBe(false);
  });

  it("salts: the same passphrase hashes differently every time", { timeout: SLOW }, async () => {
    const a = await hashPassphrase("correct horse battery staple");
    const b = await hashPassphrase("correct horse battery staple");
    expect(a).not.toBe(b);
    expect(await verifyPassphrase("correct horse battery staple", b)).toBe(true);
  });

  it("stores no trace of the plaintext", { timeout: SLOW }, async () => {
    const stored = await hashPassphrase("correct horse battery staple");
    expect(stored).not.toContain("correct");
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
  });

  it("normalizes unicode so the same typed passphrase always matches", { timeout: SLOW }, async () => {
    // "é" as one code point vs. e + combining accent: identical on screen and
    // on the keyboard, different bytes. Without NFKC the admin locks themselves
    // out by typing on a different OS.
    const stored = await hashPassphrase("café-brûlée-2026!");
    expect(await verifyPassphrase("café-brûlée-2026!", stored)).toBe(true);
  });

  it("fails closed on a missing or corrupted stored hash", async () => {
    expect(await verifyPassphrase("anything", null)).toBe(false);
    expect(await verifyPassphrase("anything", "")).toBe(false);
    expect(await verifyPassphrase("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassphrase("anything", "scrypt$32768$8$1$onlyfourparts")).toBe(false);
    expect(await verifyPassphrase("anything", "bcrypt$1$2$3$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("flags hashes made with weaker parameters for upgrade", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash("scrypt$32768$8$1$c2FsdA==$aGFzaA==")).toBe(false);
    expect(needsRehash("garbage")).toBe(true);
    expect(needsRehash(null)).toBe(false);
  });
});

describe("validateAdminPassphrase", () => {
  it("accepts a strong mixed passphrase", () => {
    expect(validateAdminPassphrase("Tr0ubled-Otter!42").valid).toBe(true);
  });

  it("accepts a long word passphrase with no symbols or digits", () => {
    // Four words beat "Adm1n!23" and are what people can actually retype.
    expect(validateAdminPassphrase("purple mango kettle riverbank").valid).toBe(true);
  });

  it("rejects short, single-class, obvious and repetitive values", () => {
    expect(validateAdminPassphrase("Short1!").valid).toBe(false);
    expect(validateAdminPassphrase("alllowercaseletters").valid).toBe(false);
    expect(validateAdminPassphrase("ReelSpy-Admin-99!").valid).toBe(false);
    expect(validateAdminPassphrase("ababababababababab").valid).toBe(false);
  });

  it("rejects a passphrase built from the admin's own email", () => {
    const check = validateAdminPassphrase("Majd-Sayed-9times!", { email: "majd@reelspy.dev" });
    expect(check.valid).toBe(false);
    expect(check.problems.some((p) => p.includes("email"))).toBe(true);
  });

  it("rejects reusing the account password — two factors, two secrets", () => {
    const check = validateAdminPassphrase("Tr0ubled-Otter!42", {
      accountPassword: "Tr0ubled-Otter!42",
    });
    expect(check.valid).toBe(false);
  });

  it("reports every unmet rule at once", () => {
    expect(validateAdminPassphrase("admin").problems.length).toBeGreaterThan(1);
  });
});

describe("enrollment tickets", () => {
  it("mints readable, grouped, high-entropy codes", () => {
    const ticket = randomEnrollmentTicket();
    expect(ticket).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    // No 0/O/1/I/L: these get read off a terminal and typed into a browser.
    expect(ticket).not.toMatch(/[01OIL]/);
    expect(randomEnrollmentTicket()).not.toBe(ticket);
  });

  it("normalizes what a human actually types", () => {
    const ticket = randomEnrollmentTicket();
    expect(normalizeEnrollmentTicket(ticket.toLowerCase())).toBe(ticket);
    expect(normalizeEnrollmentTicket(ticket.replace(/-/g, ""))).toBe(ticket);
    expect(normalizeEnrollmentTicket(` ${ticket.replace(/-/g, " ")} `)).toBe(ticket);
  });

  it("compares digests without leaking a match position", () => {
    expect(digestsMatch(sha256Hex("abc"), sha256Hex("abc"))).toBe(true);
    expect(digestsMatch(sha256Hex("abc"), sha256Hex("abd"))).toBe(false);
    expect(digestsMatch(sha256Hex("abc"), "short")).toBe(false);
  });
});
