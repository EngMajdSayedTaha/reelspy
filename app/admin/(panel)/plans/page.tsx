import { PlansTable } from "@/components/admin/plans/PlansTable";

export const metadata = { title: "Plans & pricing · Admin" };

export default function AdminPlansPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Plans &amp; pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The plan catalog: limits, customer-facing copy, trials and prices. Editing here replaces what
          used to need a deploy. For an individual subscriber&apos;s billing — sync, refunds — see Billing.
        </p>
      </div>
      <PlansTable />
    </div>
  );
}
