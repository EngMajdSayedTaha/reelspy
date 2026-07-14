import { AdminOverview } from "@/components/admin/overview/AdminOverview";

export const metadata = { title: "Overview · Admin" };

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live health of users, billing, jobs and AI spend.
        </p>
      </div>
      <AdminOverview />
    </div>
  );
}
