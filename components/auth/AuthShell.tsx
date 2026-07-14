"use client";

// Shared visual chrome for all 4 auth pages (/login, /signup, /forgot-password,
// /reset-password): ambient glow, logo + tagline, card, legal footer. Extracted
// from the original app/login/page.tsx so the pages stay visually identical.

import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { useDict } from "@/lib/i18n/I18nProvider";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  const dict = useDict();
  const auth = dict.auth;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* Ambient accent glow */}
      <div className="glow-drift pointer-events-none absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />

      <div className="animate-rise relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark size={48} ariaLabel={dict.shell.logoAlt} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Reel<span className="text-brand">Spy</span>
            </h1>
            <p className="mt-1 text-sm text-subtle">{auth.tagline}</p>
          </div>
        </div>

        <Card className="border-border bg-card text-foreground">
          <CardContent className="space-y-4 pt-6">{children}</CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-subtle">
          <a href="/terms" className="hover:text-foreground">
            {auth.terms}
          </a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:text-foreground">
            {auth.privacyPolicy}
          </a>
          <span className="mx-2">·</span>
          <a href="/cookies" className="hover:text-foreground">
            {auth.cookiePolicy}
          </a>
        </p>
      </div>
    </div>
  );
}
