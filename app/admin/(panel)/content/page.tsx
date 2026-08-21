import { Suspense } from "react";
import { ContentBrowser } from "@/components/admin/content/ContentBrowser";
import { resourceList } from "@/lib/admin/resources";

export const metadata = { title: "Content · Admin" };

export default function AdminContentPage() {
  const resources = resourceList();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and moderate user content. Filter by user id or search.
        </p>
      </div>
      {/* ContentBrowser reads resource/user from searchParams (useSearchParams). */}
      <Suspense fallback={null}>
        <ContentBrowser resources={resources} />
      </Suspense>
    </div>
  );
}
