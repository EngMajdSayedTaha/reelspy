import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
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
            href="/login"
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
          <Link href="/terms" className="hover:text-accent-brand">
            {t.termsOfService}
          </Link>
          <Link href="/privacy" className="hover:text-accent-brand">
            {t.privacyPolicy}
          </Link>
          <Link href="/cookies" className="hover:text-accent-brand">
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
