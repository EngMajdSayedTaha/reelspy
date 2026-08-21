import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkEnrollmentTicket,
  enrollmentState,
  lockRemainingSeconds,
  verifyAdminPassphrase,
} from "@/lib/admin/credentials";
import { hashPassphrase } from "@/lib/admin/passphrase";
import { randomEnrollmentTicket, sha256Hex } from "@/lib/admin/token";

// Brute-force behaviour is the part of step-up auth an attacker actually
// interacts with, so it is pinned here: what counts as a failure, when the lock
// trips, how long it grows, and that success wipes the slate.

const SLOW = 20_000;
const PASSPHRASE = "purple mango kettle riverbank";

type Row = Record<string, unknown> | null;

function fakeClient(initial: Row) {
  let row = initial;
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          row = { ...(row ?? {}), ...patch };
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, current: () => row };
}

function credential(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "admin-1",
    passphrase_hash: null,
    passphrase_set_at: null,
    failed_attempts: 0,
    last_failed_at: null,
    locked_until: null,
    enrollment_hash: null,
    enrollment_expires_at: null,
    enrollment_created_at: null,
    last_verified_at: null,
    ...overrides,
  };
}

describe("verifyAdminPassphrase", () => {
  it("accepts the right passphrase and clears the failure count", { timeout: SLOW }, async () => {
    const { client, current } = fakeClient(
      credential({ passphrase_hash: await hashPassphrase(PASSPHRASE), failed_attempts: 3 })
    );
    expect((await verifyAdminPassphrase(client, "admin-1", PASSPHRASE)).status).toBe("ok");
    expect(current()!.failed_attempts).toBe(0);
    expect(current()!.locked_until).toBeNull();
  });

  it("counts a wrong passphrase and reports the attempts left", { timeout: SLOW }, async () => {
    const { client, current } = fakeClient(
      credential({ passphrase_hash: await hashPassphrase(PASSPHRASE) })
    );
    const outcome = await verifyAdminPassphrase(client, "admin-1", "wrong one entirely");
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") {
      expect(outcome.failedAttempts).toBe(1);
      expect(outcome.remainingAttempts).toBe(4);
      expect(outcome.lockedForSeconds).toBe(0);
    }
    expect(current()!.failed_attempts).toBe(1);
  });

  it("locks after the fifth wrong attempt", { timeout: SLOW }, async () => {
    const { client, current } = fakeClient(
      credential({ passphrase_hash: await hashPassphrase(PASSPHRASE), failed_attempts: 4 })
    );
    const outcome = await verifyAdminPassphrase(client, "admin-1", "still wrong");
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") expect(outcome.lockedForSeconds).toBe(5 * 60);
    expect(current()!.locked_until).not.toBeNull();
  });

  it("doubles the lockout on each further attempt, capped at an hour", { timeout: SLOW }, async () => {
    const hash = await hashPassphrase(PASSPHRASE);
    for (const [attemptsBefore, expectedMinutes] of [[5, 10], [6, 20], [7, 40], [8, 60], [20, 60]] as const) {
      const { client } = fakeClient(credential({ passphrase_hash: hash, failed_attempts: attemptsBefore }));
      const outcome = await verifyAdminPassphrase(client, "admin-1", "wrong");
      if (outcome.status === "invalid") {
        expect(outcome.lockedForSeconds).toBe(expectedMinutes * 60);
      } else {
        throw new Error(`expected invalid, got ${outcome.status}`);
      }
    }
  });

  it("refuses to even compare while locked out", { timeout: SLOW }, async () => {
    // The correct passphrase does NOT get you in early — otherwise the lockout
    // is only a lockout for someone who is guessing badly.
    const { client } = fakeClient(
      credential({
        passphrase_hash: await hashPassphrase(PASSPHRASE),
        failed_attempts: 5,
        locked_until: new Date(Date.now() + 120_000).toISOString(),
      })
    );
    const outcome = await verifyAdminPassphrase(client, "admin-1", PASSPHRASE);
    expect(outcome.status).toBe("locked");
  });

  it("lets an expired lockout through", { timeout: SLOW }, async () => {
    const { client } = fakeClient(
      credential({
        passphrase_hash: await hashPassphrase(PASSPHRASE),
        failed_attempts: 5,
        locked_until: new Date(Date.now() - 1000).toISOString(),
      })
    );
    expect((await verifyAdminPassphrase(client, "admin-1", PASSPHRASE)).status).toBe("ok");
  });

  it("reports 'not enrolled' rather than 'wrong' when no passphrase exists", async () => {
    const { client } = fakeClient(credential());
    expect((await verifyAdminPassphrase(client, "admin-1", "anything")).status).toBe("not_enrolled");
    const missing = fakeClient(null);
    expect((await verifyAdminPassphrase(missing.client, "admin-1", "anything")).status).toBe(
      "not_enrolled"
    );
  });
});

describe("enrollmentState", () => {
  const future = new Date(Date.now() + 600_000).toISOString();
  const past = new Date(Date.now() - 600_000).toISOString();

  it("reads the row the way the setup and unlock pages branch on it", () => {
    expect(enrollmentState(null)).toBe("none");
    expect(enrollmentState(credential() as never)).toBe("none");
    expect(
      enrollmentState(credential({ enrollment_hash: "x", enrollment_expires_at: future }) as never)
    ).toBe("invited");
    expect(
      enrollmentState(credential({ enrollment_hash: "x", enrollment_expires_at: past }) as never)
    ).toBe("none");
    expect(enrollmentState(credential({ passphrase_hash: "scrypt$..." }) as never)).toBe("enrolled");
  });
});

describe("checkEnrollmentTicket", () => {
  const ticket = randomEnrollmentTicket();

  it("accepts the minted code, in any case or spacing", async () => {
    const { client } = fakeClient(
      credential({
        enrollment_hash: sha256Hex(ticket),
        enrollment_expires_at: new Date(Date.now() + 600_000).toISOString(),
      })
    );
    expect(await checkEnrollmentTicket(client, "admin-1", ticket.toLowerCase())).toEqual({ ok: true });
  });

  it("rejects a wrong, expired or absent code", async () => {
    const live = {
      enrollment_hash: sha256Hex(ticket),
      enrollment_expires_at: new Date(Date.now() + 600_000).toISOString(),
    };
    const wrong = fakeClient(credential(live));
    expect(await checkEnrollmentTicket(wrong.client, "admin-1", randomEnrollmentTicket())).toEqual({
      ok: false,
      reason: "invalid",
    });

    const expired = fakeClient(
      credential({ ...live, enrollment_expires_at: new Date(Date.now() - 1000).toISOString() })
    );
    expect(await checkEnrollmentTicket(expired.client, "admin-1", ticket)).toEqual({
      ok: false,
      reason: "expired",
    });

    const none = fakeClient(credential());
    expect(await checkEnrollmentTicket(none.client, "admin-1", ticket)).toEqual({
      ok: false,
      reason: "none",
    });
  });
});

describe("lockRemainingSeconds", () => {
  it("counts down and never goes negative", () => {
    expect(lockRemainingSeconds(null)).toBe(0);
    expect(lockRemainingSeconds(credential({ locked_until: null }) as never)).toBe(0);
    expect(
      lockRemainingSeconds(credential({ locked_until: new Date(Date.now() - 5000).toISOString() }) as never)
    ).toBe(0);
    expect(
      lockRemainingSeconds(credential({ locked_until: new Date(Date.now() + 60_000).toISOString() }) as never)
    ).toBeGreaterThan(50);
  });
});
