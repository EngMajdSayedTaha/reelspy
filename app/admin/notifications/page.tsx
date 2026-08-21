import { NotificationsAdmin } from "@/components/admin/notifications/NotificationsAdmin";

export const metadata = { title: "Notifications · Admin" };

export default function AdminNotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the product thinks you should know about — who joined, what was paid, what
          broke — and exactly which of it reaches your inbox.
        </p>
      </div>
      <NotificationsAdmin />
    </div>
  );
}
