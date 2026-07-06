import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).legal.cookies;
  return {
    title: `${t.title} — ReelSpy`,
    description: t.metaDescription,
  };
}

export default async function CookiesPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.legal.cookies;
  const common = dict.legal.common;
  const updated = new Date(t.updatedDate).toLocaleDateString(intlLocale(locale), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <LegalLayout title={t.title} updated={updated}>
      <p>{t.intro}</p>

      <LegalSection heading={t.sections.whatAreCookies.heading}>
        <p>{t.sections.whatAreCookies.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.howWeUse.heading}>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-start text-sm">
            <thead className="bg-surface-2 text-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t.sections.howWeUse.table.type}</th>
                <th className="px-4 py-2.5 font-medium">{t.sections.howWeUse.table.purpose}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {t.sections.howWeUse.essential.label}
                </td>
                <td className="px-4 py-2.5">{t.sections.howWeUse.essential.body}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {t.sections.howWeUse.preferences.label}
                </td>
                <td className="px-4 py-2.5">{t.sections.howWeUse.preferences.body}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">{t.sections.howWeUse.note}</p>
      </LegalSection>

      <LegalSection heading={t.sections.managingChoices.heading}>
        <p>{t.sections.managingChoices.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.moreInfo.heading}>
        <p>
          {t.sections.moreInfo.before}
          <Link href="/privacy" className="text-brand hover:underline">
            {common.privacyPolicy}
          </Link>
          {t.sections.moreInfo.middle}
          <a href="mailto:privacy@reelspy.app" className="text-brand hover:underline">
            privacy@reelspy.app
          </a>
          {t.sections.moreInfo.after}
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
