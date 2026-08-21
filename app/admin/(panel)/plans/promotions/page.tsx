import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { listAdminPlans } from "@/lib/admin/plans";
import { PromoCodes } from "@/components/admin/plans/PromoCodes";

export const metadata = { title: "Promo codes · Admin" };

export default async function AdminPromotionsPage() {
  const { admin } = await requireAdminPage();
  // Needed for the "restrict to plan" picker; a promo is scoped by Stripe
  // Product, which is why only plans that have one can be restricted to.
  const plans = await listAdminPlans(admin).catch(() => []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ms-2 mb-1">
          <Link href="/admin/plans">
            <ArrowLeft className="h-4 w-4" /> Plans &amp; pricing
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Promo codes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discount codes customers enter at Stripe checkout. Stripe validates and counts them; this is
          where they&apos;re created and retired.
        </p>
      </div>
      <PromoCodes plans={plans} />
    </div>
  );
}
