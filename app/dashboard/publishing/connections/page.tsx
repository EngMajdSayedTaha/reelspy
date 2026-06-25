import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Connections were unified into a single hub at /dashboard/connections. This
// route is kept as a redirect so old links and any in-flight OAuth round-trips
// still land in the right place (forwarding success/error query params).
export default async function PublishingConnectionsRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const qs = query.toString();
  redirect(`/dashboard/connections${qs ? `?${qs}` : ""}`);
}
