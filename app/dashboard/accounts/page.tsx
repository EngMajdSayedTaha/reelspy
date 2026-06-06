import { redirect } from "next/navigation";
import { AccountCard } from "@/components/accounts/AccountCard";
import { AddAccountForm } from "@/components/accounts/AddAccountForm";
import { GroupsManager } from "@/components/accounts/GroupsManager";
import { createClient } from "@/lib/supabase/server";
import {
  addInspirationAccount,
  assignAccountGroup,
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

export default async function AccountsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("inspiration_accounts")
    .select(
      "id, ig_username, display_name, avatar_url, followers_count, is_active, last_synced_at, group_id"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const accounts = (data ?? []) as InspirationAccount[];

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

      <AddAccountForm action={addInspirationAccount} />

      <GroupsManager
        groups={groups}
        createAction={createAccountGroup}
        deleteAction={deleteAccountGroup}
        renameAction={renameAccountGroup}
      />

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          No inspiration accounts yet. Add your first account above.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
