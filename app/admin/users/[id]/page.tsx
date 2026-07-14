import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserDetail } from "@/components/admin/users/UserDetail";

export const metadata = { title: "User · Admin" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/users"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>
      <UserDetail userId={id} />
    </div>
  );
}
