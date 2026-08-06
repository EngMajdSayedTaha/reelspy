import { WaitlistAdmin } from "@/components/admin/waitlist/WaitlistAdmin";

export const metadata = { title: "Waiting list · Admin" };

export default function AdminWaitlistPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Waiting list</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn the closed beta on or off, and review everyone who applied.
        </p>
      </div>
      <WaitlistAdmin />
    </div>
  );
}
