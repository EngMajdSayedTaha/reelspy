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
