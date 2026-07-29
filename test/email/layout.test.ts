import { describe, it, expect, afterEach, vi } from "vitest";
import { buildEmail, logoUrl, escapeHtml, SUPPORT_EMAIL } from "@/lib/email/layout";

// The shared email template is what makes every message look like it came from
// the same company, so the things worth pinning are the brand furniture (logo,
// footer, support address), the HTML/text parity, and escaping.

afterEach(() => {
  vi.unstubAllEnvs();
});

const sample = () =>
  buildEmail({
    eyebrow: "Billing",
    preheader: "Nothing changes today.",
    title: "Your plan changes to Pro on Aug 29, 2026",
    blocks: [
      { kind: "paragraph", text: "Your upgrade is booked." },
      { kind: "rows", caption: "What was scheduled", rows: [{ label: "Charged today", value: "Nothing" }] },
      { kind: "bullets", caption: "What Pro gives you", items: ["50 tracked accounts"] },
      { kind: "callout", text: "Nothing changes in your account today.", tone: "success" },
    ],
    cta: { href: "https://app.reelspy.dev/dashboard/billing", label: "View scheduled change" },
    secondary: { href: "https://invoice.example/1", label: "View invoice" },
    footnote: "You can cancel this scheduled change any time.",
  });

describe("buildEmail", () => {
  it("renders the ReelSpy logo from an absolute public URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.reelspy.dev");
    const { html } = sample();
    expect(logoUrl()).toBe("https://app.reelspy.dev/brand/reelspy-logo-512.png");
    expect(html).toContain(`src="${logoUrl()}"`);
    expect(html).toContain('alt="ReelSpy"');
  });

  it("is a complete, self-describing HTML document", () => {
    const { html } = sample();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Your plan changes to Pro on Aug 29, 2026</title>");
    // Table-based layout is what survives Outlook.
    expect(html).toContain('role="presentation"');
    expect(html).toContain("prefers-color-scheme:dark");
  });

  it("puts the preheader in a hidden preview block", () => {
    const { html } = sample();
    const hidden = html.slice(html.indexOf("display:none"), html.indexOf("display:none") + 400);
    expect(hidden).toContain("Nothing changes today.");
  });

  it("renders every block kind and both actions", () => {
    const { html } = sample();
    expect(html).toContain("Your upgrade is booked.");
    expect(html).toContain("What was scheduled");
    expect(html).toContain("Charged today");
    expect(html).toContain("50 tracked accounts");
    expect(html).toContain("Nothing changes in your account today.");
    expect(html).toContain('href="https://app.reelspy.dev/dashboard/billing"');
    expect(html).toContain("View invoice");
  });

  it("always carries the support address and legal footer", () => {
    const { html, text } = sample();
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(html).toContain("/terms");
    expect(html).toContain("/privacy");
    expect(html).toContain("ReelSpy · Dubai, United Arab Emirates");
    expect(text).toContain(SUPPORT_EMAIL);
  });

  it("produces a plain-text alternative with the same substance and no markup", () => {
    const { text } = sample();
    expect(text).toContain("Your plan changes to Pro on Aug 29, 2026");
    expect(text).toContain("Charged today: Nothing");
    expect(text).toContain("- 50 tracked accounts");
    expect(text).toContain("View scheduled change: https://app.reelspy.dev/dashboard/billing");
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("escapes user-supplied content instead of rendering it", () => {
    const { html, text } = buildEmail({
      eyebrow: "Publishing",
      preheader: "x",
      title: 'Post "<script>alert(1)</script>"',
      blocks: [{ kind: "paragraph", text: "<b>bold</b> & risky" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; risky");
    // The text part is never interpreted, so it keeps the original characters.
    expect(text).toContain("<b>bold</b> & risky");
  });

  it("only shows an unsubscribe link when one is supplied", () => {
    const withOut = buildEmail({ eyebrow: "A", preheader: "b", title: "c", blocks: [] });
    expect(withOut.html).not.toContain("Unsubscribe");
    const withIn = buildEmail({
      eyebrow: "A",
      preheader: "b",
      title: "c",
      blocks: [],
      unsubscribeUrl: "https://app.reelspy.dev/unsub?t=1",
    });
    expect(withIn.html).toContain("Unsubscribe");
    expect(withIn.text).toContain("https://app.reelspy.dev/unsub?t=1");
  });
});

describe("escapeHtml", () => {
  it("neutralizes every character that can break out of an attribute or tag", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });
});
