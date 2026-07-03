import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service — ReelSpy",
  description: "The terms that govern your use of ReelSpy.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="July 3, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of ReelSpy
        (&ldquo;ReelSpy&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or
        using the service you agree to these Terms. If you do not agree, do not use ReelSpy.
      </p>

      <LegalSection heading="1. The Service">
        <p>
          ReelSpy is a content-research and creation tool for social media creators. It helps
          you track and analyze reels, generate scripts with AI assistance, and schedule or
          publish content to connected platforms. Features vary by plan and may change as the
          product evolves.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility &amp; Accounts">
        <p>
          You must be at least 18 years old and able to form a binding contract. You are
          responsible for your account credentials and for all activity under your account.
          You must provide accurate information and keep it up to date.
        </p>
      </LegalSection>

      <LegalSection heading="3. Plans, Billing &amp; Renewal">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Paid plans (Creator, Pro, Studio) are billed in advance on a recurring monthly
            basis through our payment processor, Stripe. Prices are shown at checkout.
          </li>
          <li>
            Your subscription renews automatically each period until you cancel. You can cancel
            anytime from the billing portal; cancellation stops future charges and your paid
            access continues until the end of the current period.
          </li>
          <li>
            We may change prices or plan limits with reasonable notice. Changes take effect at
            your next renewal.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Refunds">
        <p>
          If you are not satisfied, email{" "}
          <a href="mailto:support@reelspy.app" className="text-brand hover:underline">
            support@reelspy.app
          </a>{" "}
          within <span className="font-medium text-foreground">7 days</span> of your first
          payment on a plan and we will refund that payment in full. Beyond this window,
          payments already made are non-refundable, but you can cancel at any time to avoid
          future charges. Nothing here limits rights you may have under applicable consumer law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Violate the terms or policies of any connected platform (Instagram, Facebook,
            TikTok, YouTube) or applicable law.
          </li>
          <li>Publish content that is unlawful, infringing, deceptive, or harmful.</li>
          <li>
            Attempt to reverse-engineer, overload, scrape, or circumvent the rate limits or
            security of the service.
          </li>
          <li>Resell or share your account access without our permission.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Your Content">
        <p>
          You retain ownership of the content you upload, generate, or publish through ReelSpy.
          You grant us the limited licence needed to store, process, and transmit that content
          to operate the service (for example, sending a video to a platform you chose to
          publish to). You are responsible for the content you publish and for having the rights
          to it.
        </p>
      </LegalSection>

      <LegalSection heading="7. AI-Generated Output">
        <p>
          Scripts and suggestions are produced with the help of third-party AI models and are
          provided as drafts. Output may be inaccurate or resemble other material; you are
          responsible for reviewing and editing anything before you publish it. ReelSpy does not
          guarantee any particular reach, engagement, or business result.
        </p>
      </LegalSection>

      <LegalSection heading="8. Third-Party Platforms">
        <p>
          ReelSpy connects to platforms you authorize via their official APIs. Your use of those
          platforms remains subject to their own terms, and their availability or API changes
          are outside our control. We are not responsible for actions taken by those platforms
          on your account.
        </p>
      </LegalSection>

      <LegalSection heading="9. Cancellation &amp; Termination">
        <p>
          You may stop using ReelSpy and delete your account at any time from Settings, which
          removes your data as described in our{" "}
          <Link href="/privacy" className="text-brand hover:underline">
            Privacy Policy
          </Link>
          . We may suspend or terminate access if you breach these Terms or use the service in a
          way that risks harm to others or to the platforms we integrate with.
        </p>
      </LegalSection>

      <LegalSection heading="10. Disclaimers &amp; Liability">
        <p>
          The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the
          maximum extent permitted by law, ReelSpy is not liable for indirect, incidental, or
          consequential damages, and our total liability for any claim is limited to the amount
          you paid us in the 3 months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="11. Governing Law">
        <p>
          These Terms are governed by the laws of the United Arab Emirates, without regard to
          conflict-of-law rules. Disputes are subject to the courts of the UAE.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes &amp; Contact">
        <p>
          We may update these Terms; material changes will be notified in-app or by email, and
          continued use after changes means you accept them. Questions? Email{" "}
          <a href="mailto:support@reelspy.app" className="text-brand hover:underline">
            support@reelspy.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
