import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Cookie Policy — ReelSpy",
  description: "How and why ReelSpy uses cookies and local storage.",
};

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookie Policy" updated="June 15, 2026">
      <p>
        This Cookie Policy explains how ReelSpy uses cookies and similar
        technologies (such as browser local storage) to recognize you when you
        use our application.
      </p>

      <LegalSection heading="What are cookies?">
        <p>
          Cookies are small text files placed on your device when you visit a
          website. They are widely used to make applications work, to keep you
          signed in, and to remember your preferences.
        </p>
      </LegalSection>

      <LegalSection heading="How we use cookies">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-2.5 font-medium text-foreground">Essential</td>
                <td className="px-4 py-2.5">
                  Authentication and session cookies that keep you signed in and
                  secure your account. The app cannot function without these.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-foreground">Preferences</td>
                <td className="px-4 py-2.5">
                  Remember choices like your color theme, feed layout, and your
                  cookie-consent decision. Stored in your browser&rsquo;s local
                  storage and cookies.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          We do not currently use third-party advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="Managing your choices">
        <p>
          When you first visit ReelSpy, a banner lets you accept or reject
          non-essential cookies. You can change your decision at any time by
          clearing your browser storage for this site. Most browsers also let you
          block or delete cookies through their settings, though blocking
          essential cookies may stop you from signing in.
        </p>
      </LegalSection>

      <LegalSection heading="More information">
        <p>
          For details on how we handle your personal data, see our{" "}
          <Link href="/privacy" className="text-brand hover:underline">
            Privacy Policy
          </Link>
          . Questions? Email{" "}
          <a href="mailto:privacy@reelspy.app" className="text-brand hover:underline">
            privacy@reelspy.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
