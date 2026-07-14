import { AuditViewer } from "@/components/admin/audit/AuditViewer";

export const metadata = { title: "Audit log · Admin" };

export default function AdminAuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of every admin mutation. Read-only.
        </p>
      </div>
      <AuditViewer />
    </div>
  );
}
