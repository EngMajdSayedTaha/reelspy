import type { SupabaseClient } from "@supabase/supabase-js";

type QueryResult = { data: unknown; error: unknown };

// Minimal fake of the Supabase query builder used by the billing reads:
//   supabase.from(table).select(cols).eq(col, val).maybeSingle() -> {data,error}
// and the RPC path:
//   supabase.rpc(name, params) -> {data,error}
// Only the methods our code actually calls are implemented; the chain is
// thenable-free because the code awaits maybeSingle()/rpc() directly.
export function fakeSupabase(opts: {
  maybeSingle?: QueryResult;
  rpc?: QueryResult;
}): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => opts.maybeSingle ?? { data: null, error: null },
  };
  const client = {
    from: () => builder,
    rpc: async () => opts.rpc ?? { data: null, error: null },
  };
  return client as unknown as SupabaseClient;
}

// Richer fake for the admin routes/helpers: supports the insert/update/delete/
// range/order/ilike/in chains and an awaitable terminal (list queries `await`
// the builder directly for `{ data, count, error }`). `recorder` captures the
// last insert/update/delete payload so tests can assert what was written.
export type FakeRecorder = {
  inserted: unknown[];
  updated: unknown[];
  deleted: number;
  lastTable: string | null;
};

export function fakeAdminSupabase(opts: {
  /** Result for `.maybeSingle()` / `.single()`. */
  maybeSingle?: QueryResult;
  /** Result for an awaited list query: `{ data, count, error }`. */
  list?: { data: unknown; count?: number | null; error?: unknown };
  /** Result for `.insert()` (awaited): `{ data, error }`. */
  insert?: QueryResult;
  /** Result for `.rpc()`. */
  rpc?: QueryResult;
  recorder?: FakeRecorder;
}): SupabaseClient {
  const rec = opts.recorder;
  const listResult = { data: opts.list?.data ?? [], count: opts.list?.count ?? null, error: opts.list?.error ?? null };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    neq: chain,
    ilike: chain,
    in: chain,
    order: chain,
    range: chain,
    limit: chain,
    gte: chain,
    lte: chain,
    maybeSingle: async () => opts.maybeSingle ?? { data: null, error: null },
    single: async () => opts.maybeSingle ?? { data: null, error: null },
    insert: (payload: unknown) => {
      if (rec) rec.inserted.push(payload);
      const result = opts.insert ?? { data: null, error: null };
      // Awaitable AND chainable (.select().maybeSingle()).
      return {
        select: () => builder,
        maybeSingle: async () => result,
        single: async () => result,
        then(resolve: (v: QueryResult) => void) {
          resolve(result);
        },
      };
    },
    update: (payload: unknown) => {
      if (rec) rec.updated.push(payload);
      return builder;
    },
    upsert: (payload: unknown) => {
      if (rec) rec.inserted.push(payload);
      return builder;
    },
    delete: () => {
      if (rec) rec.deleted += 1;
      return builder;
    },
    // Awaiting the builder itself yields the list result.
    then(resolve: (value: typeof listResult) => void) {
      resolve(listResult);
    },
  });

  const client = {
    from: (table: string) => {
      if (rec) rec.lastTable = table;
      return builder;
    },
    rpc: async () => opts.rpc ?? { data: null, error: null },
  };
  return client as unknown as SupabaseClient;
}

export function makeRecorder(): FakeRecorder {
  return { inserted: [], updated: [], deleted: 0, lastTable: null };
}

// A fake whose rpc/maybeSingle throw, to exercise fail-open catch branches.
export function throwingSupabase(): SupabaseClient {
  const boom = () => {
    throw new Error("db down");
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: boom,
  };
  const client = {
    from: () => builder,
    rpc: boom,
  };
  return client as unknown as SupabaseClient;
}
