import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).legal.privacy;
  return {
    title: `${t.title} — ReelSpy`,
    description: t.metaDescription,
  };
}

export default async function PrivacyPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.legal.privacy;
  const common = dict.legal.common;
  const updated = new Date(t.updatedDate).toLocaleDateString(intlLocale(locale), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <LegalLayout title={t.title} updated={updated}>
      <p>{t.intro}</p>

      <LegalSection heading={t.sections.collection.heading}>
        <ul className="list-disc space-y-1.5 ps-5">
          <li>
            <span className="font-medium text-foreground">
              {t.sections.collection.items.account.label}
            </span>{" "}
            {t.sections.collection.items.account.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.collection.items.instagram.label}
            </span>{" "}
            {t.sections.collection.items.instagram.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.collection.items.usage.label}
            </span>{" "}
            {t.sections.collection.items.usage.body}
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading={t.sections.use.heading}>
        <p>{t.sections.use.intro}</p>
        <ul className="list-disc space-y-1.5 ps-5">
          {t.sections.use.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection heading={t.sections.instagramPlatform.heading}>
        <p>{t.sections.instagramPlatform.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.subprocessors.heading}>
        <p>{t.sections.subprocessors.intro}</p>
        <ul className="list-disc space-y-1.5 ps-5">
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.supabase.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.supabase.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.vercel.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.vercel.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.cloudflareR2.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.cloudflareR2.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.stripe.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.stripe.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.aiModels.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.aiModels.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.transcription.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.transcription.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.platforms.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.platforms.body}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t.sections.subprocessors.providers.resend.label}
            </span>{" "}
            — {t.sections.subprocessors.providers.resend.body}
          </li>
        </ul>
        <p>{t.sections.subprocessors.outro}</p>
      </LegalSection>

      <LegalSection heading={t.sections.cookiesSection.heading}>
        <p>
          {t.sections.cookiesSection.before}
          <Link href="/cookies" className="text-brand hover:underline">
            {common.cookiePolicy}
          </Link>
          {t.sections.cookiesSection.after}
        </p>
      </LegalSection>

      <LegalSection heading={t.sections.retention.heading}>
        <p>
          {t.sections.retention.before}
          <Link href="/dashboard/settings" className="text-brand hover:underline">
            {t.sections.retention.settingsLinkText}
          </Link>
          {t.sections.retention.after}
        </p>
      </LegalSection>

      <LegalSection heading={t.sections.rights.heading}>
        <p>
          {t.sections.rights.before}
          <span className="font-medium text-foreground">{t.sections.rights.exportWord}</span>
          {t.sections.rights.middle}
          <span className="font-medium text-foreground">{t.sections.rights.deleteWord}</span>
          {t.sections.rights.after}
        </p>
      </LegalSection>

      <LegalSection heading={t.sections.security.heading}>
        <p>{t.sections.security.body}</p>
      </LegalSection>

      <LegalSection heading={t.sections.dpo.heading}>
        <p>
          {t.sections.dpo.before}
          <a href="mailto:privacy@reelspy.dev" className="text-brand hover:underline">
            privacy@reelspy.dev
          </a>
          {t.sections.dpo.after}
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
