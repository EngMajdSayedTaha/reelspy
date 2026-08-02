import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";
import { verifyConfirmationCode } from "@/lib/meta/signed-request";

// Status page for Meta's Data Deletion Request Callback.
//
// The callback (app/api/meta/data-deletion/route.ts) must return a URL where
// the user can check on their deletion; this is it. The code in the query
// string is self-verifying — a signed timestamp, not a database key — so this
// page holds no state and a forged code is rejected rather than shown a
// reassuring "deleted" message.
//
// Meta reviewers open this page during App Review, so it must render for a
// signed-out visitor. It is deliberately outside /dashboard.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).legal.dataDeletion;
  return {
    title: `${t.title} — ReelSpy`,
    description: t.metaDescription,
    // A per-request status page has nothing to index.
    robots: { index: false, follow: false },
  };
}

export default async function MetaDataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).legal.dataDeletion;
  const { code } = await searchParams;

  // No secret ⇒ no code can be verified. Fall through to the "can't verify"
  // branch rather than throwing: this page must render even on a misconfigured
  // deployment, because a reviewer may well be the one loading it.
  const appSecret = process.env.META_APP_SECRET ?? "";
  const result = appSecret
    ? verifyConfirmationCode(appSecret, code)
    : ({ ok: false } as const);

  const formatted = result.ok
    ? result.deletedAt.toLocaleDateString(intlLocale(locale), {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <LegalLayout title={t.title} updated={formatted || "—"}>
      {result.ok ? (
        <>
          <LegalSection heading={t.completedHeading}>
            <p>{t.completedBody(formatted)}</p>
          </LegalSection>
          <LegalSection heading={t.retainedHeading}>
            <p>{t.retainedBody}</p>
          </LegalSection>
        </>
      ) : (
        <LegalSection heading={t.unknownHeading}>
          <p>{t.unknownBody}</p>
        </LegalSection>
      )}
      <p>
        <a className="text-brand hover:underline" href={`mailto:${t.contact}`}>
          {t.contact}
        </a>
      </p>
    </LegalLayout>
  );
}
