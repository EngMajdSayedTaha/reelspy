import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — ReelSpy",
  description: "How ReelSpy collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="June 15, 2026">
      <p>
        This Privacy Policy explains how ReelSpy (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
        uses, and safeguards your information when you use the ReelSpy application.
        By using ReelSpy you agree to the practices described here.
      </p>

      <LegalSection heading="1. Information We Collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-foreground">Account data.</span> Your
            email address and authentication identifiers when you sign up or sign
            in (including via Google).
          </li>
          <li>
            <span className="font-medium text-foreground">Instagram data.</span> When
            you connect your Instagram account, we access profile details, media,
            and insights you authorize through Meta&rsquo;s Graph API in order to
            power your feed and analytics.
          </li>
          <li>
            <span className="font-medium text-foreground">Usage &amp; preferences.</span>{" "}
            Settings such as your theme, feed layout, and tracked accounts, stored
            to personalize your experience.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How We Use Your Information">
        <p>We use your information to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Provide, maintain, and improve the ReelSpy service.</li>
          <li>Authenticate you and keep your account secure.</li>
          <li>Sync and display Instagram content and performance insights.</li>
          <li>Remember your preferences across sessions.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Instagram &amp; Meta Platform Data">
        <p>
          ReelSpy uses Meta&rsquo;s Graph API. Access tokens are stored securely
          and used only to perform the actions you request. We do not sell your
          Instagram data. You can disconnect your Instagram account at any time
          from Settings, which removes the stored token.
        </p>
      </LegalSection>

      <LegalSection heading="4. Cookies">
        <p>
          We use essential cookies for authentication and to remember your
          consent and preferences. For details, see our{" "}
          <Link href="/cookies" className="text-brand hover:underline">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="5. Data Retention">
        <p>
          We retain your data for as long as your account is active. You may
          request deletion of your account and associated data at any time.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your Rights">
        <p>
          Depending on your jurisdiction, you may have the right to access,
          correct, export, or delete your personal data. To exercise these rights,
          contact us using the details below.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          Questions about this policy? Email us at{" "}
          <a href="mailto:privacy@reelspy.app" className="text-brand hover:underline">
            privacy@reelspy.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
