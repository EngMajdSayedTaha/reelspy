import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — ReelSpy",
  description: "How ReelSpy collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="July 3, 2026">
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

      <LegalSection heading="4. Service Providers (Sub-processors)">
        <p>
          We rely on the following third-party processors to run ReelSpy. Each
          receives only the data needed for its function, under its own security and
          privacy commitments:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-foreground">Supabase</span> — database,
            authentication, and file storage.
          </li>
          <li>
            <span className="font-medium text-foreground">Vercel</span> — application
            hosting and delivery.
          </li>
          <li>
            <span className="font-medium text-foreground">Cloudflare R2</span> — storage
            for videos you upload for publishing.
          </li>
          <li>
            <span className="font-medium text-foreground">Stripe</span> — payment and
            subscription processing (we never store your card details).
          </li>
          <li>
            <span className="font-medium text-foreground">Anthropic</span> and{" "}
            <span className="font-medium text-foreground">NVIDIA</span> — AI models that
            generate scripts and suggestions from the inputs you provide.
          </li>
          <li>
            <span className="font-medium text-foreground">Groq</span> and{" "}
            <span className="font-medium text-foreground">Hugging Face</span> — speech-to-text
            transcription of reels you choose to transcribe.
          </li>
          <li>
            <span className="font-medium text-foreground">Meta</span> (Instagram &amp;
            Facebook) and <span className="font-medium text-foreground">Google</span>{" "}
            (YouTube &amp; sign-in) — platforms you connect and publish to via their APIs.
          </li>
          <li>
            <span className="font-medium text-foreground">Resend</span> — transactional
            email (e.g. publish-failure notifications).
          </li>
        </ul>
        <p>
          We do not sell your personal data, and we do not share it with third parties
          except the processors above or where required by law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cookies">
        <p>
          We use essential cookies for authentication and to remember your
          consent and preferences. For details, see our{" "}
          <Link href="/cookies" className="text-brand hover:underline">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="6. Data Retention &amp; Deletion">
        <p>
          We retain your data for as long as your account is active. You can delete your
          account at any time from{" "}
          <Link href="/dashboard/settings" className="text-brand hover:underline">
            Settings
          </Link>
          . Deletion permanently removes your profile and all associated data — tracked
          accounts, reels, scripts, automations, uploaded videos, and event logs — and
          revokes any connected Meta access token. This action is immediate and cannot be
          undone.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your Rights">
        <p>
          Depending on your jurisdiction, you may have the right to access, correct, export,
          or delete your personal data. You can <span className="font-medium text-foreground">export</span>{" "}
          a machine-readable copy of your data and <span className="font-medium text-foreground">delete</span>{" "}
          your account yourself from Settings, or contact us to exercise any of these rights.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security &amp; Breach Notification">
        <p>
          We protect access tokens and other sensitive data with server-only access controls
          and encryption in transit. No system is perfectly secure; in the event of a personal
          data breach that is likely to affect you, we will notify affected users and the
          relevant authority without undue delay, consistent with applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="9. Data Protection Contact (UAE PDPL)">
        <p>
          ReelSpy processes personal data in line with the UAE Personal Data Protection Law
          (PDPL). For data-protection requests or questions — access, correction, export,
          deletion, or objection — contact our data protection point of contact at{" "}
          <a href="mailto:privacy@reelspy.app" className="text-brand hover:underline">
            privacy@reelspy.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
