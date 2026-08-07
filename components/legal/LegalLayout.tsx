import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Open-redirect guard: only same-origin relative paths — never a
// protocol-relative `//evil.com` or an absolute `https://…`. Mirrors the
// sanitizeNext() pattern in app/auth/callback and app/auth/confirm.
function isSafeBackHref(backHref: string | undefined): backHref is string {
  return !!backHref && backHref.startsWith("/") && !backHref.startsWith("//");
}

function sanitizeBackHref(backHref: string | undefined): string {
  return isSafeBackHref(backHref) ? backHref : "/login";
}

// Carries the captured `redirect` origin (e.g. back to the landing page's
// #pricing section) along when hopping between legal pages via the footer,
// so the destination page's own Back link still knows where the visitor
// actually came from instead of losing it and defaulting to /login.
export function withRedirect(path: string, backHref: string | undefined): string {
  return isSafeBackHref(backHref) ? `${path}?redirect=${encodeURIComponent(backHref)}` : path;
}

export async function LegalLayout({
  title,
  updated,
  backHref,
  children,
}: {
  title: string;
  updated: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.legal.common;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark size={28} ariaLabel={dict.shell.logoAlt} />
            <span className="text-sm font-semibold">
              Reel<span className="text-brand">Spy</span>
            </span>
          </Link>
          <Link
            href={sanitizeBackHref(backHref)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-subtle">{t.lastUpdated(updated)}</p>

        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>

        <footer className="mt-12 flex gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href={withRedirect("/terms", backHref)} className="hover:text-accent-brand">
            {t.termsOfService}
          </Link>
          <Link href={withRedirect("/privacy", backHref)} className="hover:text-accent-brand">
            {t.privacyPolicy}
          </Link>
          <Link href={withRedirect("/cookies", backHref)} className="hover:text-accent-brand">
            {t.cookiePolicy}
          </Link>
        </footer>
      </main>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
