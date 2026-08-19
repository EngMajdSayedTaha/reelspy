import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeIgToken } from "@/lib/instagram/token-store";

// Records every update/eq/neq call so we can assert the *shape* of the two
// writes storeIgToken issues, not just that some update happened.
type Call = { update?: Record<string, unknown>; eq: [string, unknown][]; neq: [string, unknown][] };

function recordingAdmin(): { admin: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const admin = {
    from: () => {
      const call: Call = { eq: [], neq: [] };
      calls.push(call);
      const chain = {
        update: (patch: Record<string, unknown>) => {
          call.update = patch;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          call.eq.push([col, val]);
          return chain;
        },
        neq: (col: string, val: unknown) => {
          call.neq.push([col, val]);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe("storeIgToken", () => {
  it("retires the ig_user_id from any OTHER profile before attaching it here", async () => {
    const { admin, calls } = recordingAdmin();

    await storeIgToken(admin, "user-a", {
      token: "tok",
      igUserId: "ig-1",
      username: "acme",
      expiresAt: null,
    });

    expect(calls).toHaveLength(2);

    // First write: clears the credential from any sibling profile that
    // already holds this ig_user_id, excluding the connecting user.
    const [cleanup, attach] = calls;
    expect(cleanup.eq).toContainEqual(["ig_user_id", "ig-1"]);
    expect(cleanup.neq).toContainEqual(["id", "user-a"]);
    expect(cleanup.update).toMatchObject({ ig_user_id: null, ig_access_token: null });

    // Second write: attaches the fresh token to the connecting user.
    expect(attach.eq).toContainEqual(["id", "user-a"]);
    expect(attach.update).toMatchObject({ ig_user_id: "ig-1", ig_access_token: "tok" });
  });
});
