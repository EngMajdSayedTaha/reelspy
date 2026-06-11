import { redirect } from "next/navigation";
import { AccountCard } from "@/components/accounts/AccountCard";
import { AccountsFilter } from "@/components/accounts/AccountsFilter";
import { AccountsSearch } from "@/components/accounts/AccountsSearch";
import { AddAccountForm } from "@/components/accounts/AddAccountForm";
import { GroupsManager } from "@/components/accounts/GroupsManager";
import { ImportFollowing } from "@/components/accounts/ImportFollowing";
import { FeedPagination } from "@/components/reels/FeedPagination";
import { createClient } from "@/lib/supabase/server";
import {
  addInspirationAccount,
  assignAccountGroup,
  bulkAddInspirationAccounts,
  createAccountGroup,
  deleteAccountGroup,
  removeInspirationAccount,
  renameAccountGroup,
  toggleAccountActive,
} from "./actions";

type InspirationAccount = {
  id: string;
  ig_username: string;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  group_id: string | null;
};

type AccountGroup = { id: string; name: string };

const PER_PAGE = 12;

type SearchParams = {
  status?: string;
  page?: string;
  q?: string;
};

// Escape LIKE wildcards so a search for "100%" doesn't match everything.
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const status = first(params.status) === "paused" || first(params.status) === "active"
    ? (first(params.status) as "active" | "paused")
    : "all";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  // Commas/parens would break PostgREST's or() filter syntax — drop them, they
  // can't appear in usernames anyway.
  const q = (first(params.q) ?? "").trim().replace(/[,()]/g, "");
  const search = q ? `%${escapeLike(q.replace(/^@+/, ""))}%` : null;

  // Status counts for the filter pills (search-aware so the pills match the list).
  const baseCount = () => {
    let query = supabase
      .from("inspiration_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (search) {
      query = query.or(`ig_username.ilike.${search},display_name.ilike.${search}`);
    }
    return query;
  };

  const [allRes, activeRes, pausedRes] = await Promise.all([
    baseCount(),
    baseCount().eq("is_active", true),
    baseCount().eq("is_active", false),
  ]);

  const counts = {
    all: allRes.count ?? 0,
    active: activeRes.count ?? 0,
    paused: pausedRes.count ?? 0,
  };

  // Paginated, filtered accounts.
  let query = supabase
    .from("inspiration_accounts")
    .select(
      "id, ig_username, display_name, avatar_url, followers_count, is_active, last_synced_at, group_id",
      { count: "exact" }
    )
    .eq("user_id", user.id);

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "paused") {
    query = query.eq("is_active", false);
  }

  if (search) {
    query = query.or(`ig_username.ilike.${search},display_name.ilike.${search}`);
  }

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const accounts = (data ?? []) as InspirationAccount[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const { data: groupRows } = await supabase
    .from("account_groups")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const groups = (groupRows ?? []) as AccountGroup[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Accounts</h1>
        <p className="text-sm text-zinc-400">
          Save inspiration accounts you want ReelSpy to track and score.
        </p>
      </div>

      <AddAccountForm action={addInspirationAccount} groups={groups} />

      <ImportFollowing groups={groups} bulkAddAction={bulkAddInspirationAccounts} />

      <GroupsManager
        groups={groups}
        createAction={createAccountGroup}
        deleteAction={deleteAccountGroup}
        renameAction={renameAccountGroup}
      />

      {counts.all === 0 && !q ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          No inspiration accounts yet. Add your first account above.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AccountsFilter current={status} counts={counts} />
            <AccountsSearch current={q} />
          </div>

          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
              {q ? `No accounts match “${q}”.` : `No ${status} accounts.`}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  groups={groups}
                  removeAction={removeInspirationAccount}
                  assignGroupAction={assignAccountGroup}
                  toggleActiveAction={toggleAccountActive}
                />
              ))}
            </div>
          )}

          <FeedPagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
        </>
      )}
    </div>
  );
}
