// Dashboard nav pages the founder can show/hide from /admin/ops (Pages tab).
// Deliberately NOT "server-only" — imported by both the client Sidebar
// (nav filtering) and server code (the flag reader + the layout guard), so it
// only carries plain data, never a DB call.
//
// "/dashboard" (the home page itself) is intentionally absent: it's the
// landing route everything else falls back to, so it's never togglable.

export const DASHBOARD_PAGES = [
  { id: "accounts", href: "/dashboard/accounts", label: "Accounts" },
  { id: "feed", href: "/dashboard/feed", label: "Feed" },
  { id: "trends", href: "/dashboard/trends", label: "Trends" },
  { id: "hooks", href: "/dashboard/hooks", label: "Hooks" },
  // /dashboard/generate/[reel_id] is the script-generation page for a reel —
  // part of Scripts even though it lives outside /dashboard/scripts (mirrors
  // the matchPrefixes entry in components/layout/Sidebar.tsx).
  { id: "scripts", href: "/dashboard/scripts", label: "Scripts", matchPrefixes: ["/dashboard/generate"] },
  { id: "myIg", href: "/dashboard/my-account", label: "My IG Account" },
  { id: "autoReply", href: "/dashboard/automations", label: "Auto-Reply" },
  { id: "publishing", href: "/dashboard/publishing", label: "Publishing" },
  { id: "calendar", href: "/dashboard/calendar", label: "Calendar" },
  { id: "connections", href: "/dashboard/connections", label: "Connections" },
  { id: "billing", href: "/dashboard/billing", label: "Billing" },
  { id: "settings", href: "/dashboard/settings", label: "Settings" },
] as const;

export type DashboardPageId = (typeof DASHBOARD_PAGES)[number]["id"];

// Kept here (not pages-flag.ts, which is "server-only") purely so client
// components like Sidebar can type a prop without importing server code.
export type PagesFlag = Record<DashboardPageId, boolean>;

// Find which togglable page (if any) a pathname belongs to — same
// prefix-match logic as the Sidebar's own isActive(), so a disabled page's
// sub-routes (e.g. /dashboard/scripts/123) are caught too.
export function matchDashboardPage(pathname: string) {
  return DASHBOARD_PAGES.find((page) => {
    if (pathname === page.href || pathname.startsWith(`${page.href}/`)) return true;
    const prefixes: readonly string[] = "matchPrefixes" in page ? page.matchPrefixes : [];
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  });
}
