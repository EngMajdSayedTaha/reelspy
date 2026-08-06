import type { SupabaseClient } from "@supabase/supabase-js";

// An in-memory stand-in for one or more Supabase tables.
//
// fakeAdminSupabase (fake-supabase.ts) returns ONE canned result for every
// query, which is enough for a route that reads once and writes once. The
// waitlist gate is different: a single call reads by user_id, then by email,
// then inserts, then runs two counting queries — and each has to see the
// effects of the last. So this fake keeps actual rows and applies the filters.
//
// Supports the subset the waitlist code uses:
//   from(t).select(cols, {count, head}).eq().lt().order().range().maybeSingle()
//   await from(t).select(...)                    -> { data, count, error }
//   from(t).insert(row).select().maybeSingle()
//   from(t).update(patch).eq(...).select().maybeSingle()
//   from(t).upsert(row, { onConflict })          (awaited)
//   from(t).delete().eq(...)                     (awaited)

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type MemoryDb = {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  /** Auto-increment source for `queue_number`, mirroring the identity column. */
  nextQueueNumber: number;
};

export function memoryDb(seed: Record<string, Row[]> = {}): MemoryDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));

  const db: MemoryDb = {
    tables,
    nextQueueNumber:
      Math.max(0, ...(tables.waitlist_entries ?? []).map((r) => Number(r.queue_number) || 0)) + 1,
    client: null as unknown as SupabaseClient,
  };

  function table(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function builder(name: string) {
    const filters: Filter[] = [];
    let headOnly = false;
    let wantCount = false;
    let pending: { kind: "insert" | "update" | "upsert" | "delete"; payload: Row } | null = null;

    const matched = () => table(name).filter((r) => filters.every((f) => f(r)));

    const apply = (): { data: Row[]; error: null } => {
      if (!pending) return { data: matched(), error: null };
      const { kind, payload } = pending;

      if (kind === "insert" || kind === "upsert") {
        const rows = table(name);
        if (kind === "upsert") {
          const key = Object.keys(payload)[0]!;
          const existing = rows.find((r) => r[key] === payload[key]);
          if (existing) {
            Object.assign(existing, payload);
            return { data: [existing], error: null };
          }
        }
        const row: Row = {
          id: payload.id ?? `row-${rows.length + 1}`,
          created_at: payload.created_at ?? new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
          ...payload,
        };
        if (name === "waitlist_entries" && row.queue_number == null) {
          row.queue_number = db.nextQueueNumber++;
        }
        rows.push(row);
        return { data: [row], error: null };
      }

      if (kind === "update") {
        const hits = matched();
        for (const r of hits) Object.assign(r, payload);
        return { data: hits, error: null };
      }

      // delete
      const hits = matched();
      tables[name] = table(name).filter((r) => !hits.includes(r));
      return { data: hits, error: null };
    };

    const terminal = () => {
      const { data } = apply();
      return {
        data: headOnly ? null : data,
        count: wantCount ? data.length : null,
        error: null,
      };
    };

    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) wantCount = true;
        if (opts?.head) headOnly = true;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return chain;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return chain;
      },
      lt: (col: string, val: unknown) => {
        filters.push((r) => Number(r[col]) < Number(val));
        return chain;
      },
      gte: (col: string, val: unknown) => {
        filters.push((r) => String(r[col]) >= String(val));
        return chain;
      },
      lte: () => chain,
      ilike: () => chain,
      or: () => chain,
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      order: () => chain,
      range: () => chain,
      limit: () => chain,
      insert: (payload: Row) => {
        pending = { kind: "insert", payload };
        return chain;
      },
      update: (payload: Row) => {
        pending = { kind: "update", payload };
        return chain;
      },
      upsert: (payload: Row) => {
        pending = { kind: "upsert", payload };
        return chain;
      },
      delete: () => {
        pending = { kind: "delete", payload: {} };
        return chain;
      },
      maybeSingle: async () => {
        const { data } = apply();
        return { data: data[0] ?? null, error: null };
      },
      single: async () => {
        const { data } = apply();
        return { data: data[0] ?? null, error: null };
      },
      then(resolve: (value: ReturnType<typeof terminal>) => void) {
        resolve(terminal());
      },
    });
    return chain;
  }

  db.client = {
    from: (name: string) => builder(name),
    rpc: async () => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }),
  } as unknown as SupabaseClient;

  return db;
}
