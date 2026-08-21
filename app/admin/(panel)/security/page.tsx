import { requireAdminPage } from "@/lib/admin/auth";
import { ELEVATION_IDLE_MINUTES } from "@/lib/admin/elevation";
import { SecurityPanel } from "@/components/admin/security/SecurityPanel";

export const metadata = { title: "Admin access · Admin" };

export default async function AdminSecurityPage() {
  const { user } = await requireAdminPage("/admin/security");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The passphrase that unlocks this panel, and the devices currently holding it open.
        </p>
      </div>
      <SecurityPanel email={user.email ?? null} idleMinutes={ELEVATION_IDLE_MINUTES} />
    </div>
  );
}
