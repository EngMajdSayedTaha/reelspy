import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

// Chrome for the two screens that exist to GET an elevation (/admin/unlock and
// /admin/setup). Deliberately NOT the AdminShell: no sidebar, no links into the
// panel, nothing to click but the form — the panel is not yours yet. Only
// admins ever see it (app/admin/layout.tsx 404s everyone else).
export default function AdminGateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">ReelSpy</span>
          <span className="flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
            <ShieldAlert className="h-3 w-3" />
            Admin
          </span>
        </div>
        <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">{children}</div>
      </div>
    </div>
  );
}
