import { AdminAnalytics } from "@/components/admin/analytics/AdminAnalytics";

export const metadata = { title: "Analytics · Admin" };

export default function AdminAnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Activation funnel, retention cohorts, publish success and AI cost.
        </p>
      </div>
      <AdminAnalytics />
    </div>
  );
}
