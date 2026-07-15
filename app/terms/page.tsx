import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).legal.terms;
  return {
    title: `${t.title} — ReelSpy`,
    description: t.metaDescription,
  };
}

export default async function TermsPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.legal.terms;
  const common = dict.legal.common;
  const updated = new Date(t.updatedDate).toLocaleDateString(intlLocale(locale), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <LegalLayout title={t.title} updated={updated}>
      <p>{t.intro}</p>

      <LegalSection heading={t.sections.service.heading}>
        <p>{t.sections.service.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.eligibility.heading}>
        <p>{t.sections.eligibility.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.billing.heading}>
        <ul className="list-disc space-y-1.5 ps-5">
          {t.sections.billing.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection heading={t.sections.refunds.heading}>
        <p>
          {t.sections.refunds.before}
          <a href="mailto:support@reelspy.dev" className="text-accent-brand hover:underline">
            support@reelspy.dev
          </a>
          {t.sections.refunds.afterEmail}
          <span className="font-medium text-foreground">{t.sections.refunds.windowWord}</span>
          {t.sections.refunds.after}
        </p>
      </LegalSection>

      <LegalSection heading={t.sections.acceptableUse.heading}>
        <p>{t.sections.acceptableUse.intro}</p>
        <ul className="list-disc space-y-1.5 ps-5">
          {t.sections.acceptableUse.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection heading={t.sections.yourContent.heading}>
        <p>{t.sections.yourContent.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.aiOutput.heading}>
        <p>{t.sections.aiOutput.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.thirdPartyPlatforms.heading}>
        <p>{t.sections.thirdPartyPlatforms.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.cancellation.heading}>
        <p>
          {t.sections.cancellation.before}
          <Link href="/privacy" className="text-accent-brand hover:underline">
            {common.privacyPolicy}
          </Link>
          {t.sections.cancellation.after}
        </p>
      </LegalSection>

      <LegalSection heading={t.sections.disclaimers.heading}>
        <p>{t.sections.disclaimers.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.governingLaw.heading}>
        <p>{t.sections.governingLaw.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.changes.heading}>
        <p>
          {t.sections.changes.before}
          <a href="mailto:support@reelspy.dev" className="text-accent-brand hover:underline">
            support@reelspy.dev
          </a>
          {t.sections.changes.after}
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
