import Link from "next/link";
import { cookies } from "next/headers";
import { Compass } from "lucide-react";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function NotFound() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Compass className="h-6 w-6 text-brand" />
      </span>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{dict.errors.notFoundTitle}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {dict.errors.notFoundMessage}
        </p>
      </div>
      <Link
        href="/dashboard"
        className="flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
      >
        {dict.errors.backToDashboard}
      </Link>
    </div>
  );
}
