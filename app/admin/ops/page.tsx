import { OpsPanel } from "@/components/admin/ops/OpsPanel";

export const metadata = { title: "Operations · Admin" };

export default function AdminOpsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jobs, cron triggers, IG cookies, rate limits, and app settings.
        </p>
      </div>
      <OpsPanel />
    </div>
  );
}
