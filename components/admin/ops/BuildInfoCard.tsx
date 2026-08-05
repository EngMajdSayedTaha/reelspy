import { getBuildInfo } from "@/lib/release/build-info";

// The technical counterpart to the user-facing version pill: which build is
// actually serving this request. Server component — the Vercel git variables are
// not NEXT_PUBLIC and must not cross into the browser bundle.
//
// English-only and unstyled for translation, like the rest of /admin.
export function BuildInfoCard() {
  const build = getBuildInfo();

  const rows: [string, string][] = [
    ["Product version", `v${build.version}`],
    ["Released", build.releasedAt],
    ["Environment", build.environment],
    ["Commit", build.commit ?? "—"],
    ["Branch", build.branch ?? "—"],
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-foreground">Build</h2>
        <p className="text-xs text-muted-foreground">
          What users see is the product version; the commit is what you need when a
          report says &ldquo;it broke after the last release&rdquo;.
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-subtle">{label}</dt>
            <dd className="truncate font-mono text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {build.commitMessage ? (
        <p className="mt-3 truncate border-t border-border pt-3 text-xs text-muted-foreground">
          {build.commitMessage}
        </p>
      ) : null}
    </div>
  );
}
