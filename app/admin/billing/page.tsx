import { BillingSubscriptions } from "@/components/admin/billing/BillingSubscriptions";

export const metadata = { title: "Billing · Admin" };

export default function AdminBillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscriptions, Stripe deep links, and manual re-sync from Stripe.
        </p>
      </div>
      <BillingSubscriptions />
    </div>
  );
}
