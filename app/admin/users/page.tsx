import { Suspense } from "react";
import { UsersTable } from "@/components/admin/users/UsersTable";

export const metadata = { title: "Users · Admin" };

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by username, exact email, or Stripe customer id (cus_…).
        </p>
      </div>
      {/* DataTable reads list state from searchParams (useSearchParams). */}
      <Suspense fallback={null}>
        <UsersTable />
      </Suspense>
    </div>
  );
}
