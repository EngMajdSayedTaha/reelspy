import { PlanEditor } from "@/components/admin/plans/PlanEditor";

export const metadata = { title: "Edit plan · Admin" };

export default async function AdminPlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanEditor planId={id} />;
}
