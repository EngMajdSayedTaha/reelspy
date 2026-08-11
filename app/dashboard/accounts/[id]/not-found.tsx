import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function AccountNotFound() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">{dict.accounts.detail.notFoundTitle}</h1>
      <p className="text-sm text-muted-foreground">{dict.accounts.detail.notFoundDesc}</p>
      <Link
        href="/dashboard/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-brand transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {dict.accounts.detail.backToAccounts}
      </Link>
    </div>
  );
}
