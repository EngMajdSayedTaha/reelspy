import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { CookieConsent } from "@/components/legal/CookieConsent";
import { PREFS_COOKIE, LANDING_LOCALE_COOKIE, parsePrefs } from "@/lib/prefs";
import { THEME_COOKIE, normalizeColorTheme } from "@/lib/color-theme";
import { dirForLocale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Arabic variable font (roadmap X1) — Geist ships latin-only, so Arabic text
// falls back to system fonts without this. Applied via `[lang="ar"]` in
// globals.css; the variable is always present so mixed content still renders.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const description =
  "Track inspiration reels, spot what's rising, and turn the best ideas into scripts.";

// clarity.microsoft.com project id — not a secret, it's embedded in the
// client-side tag either way. Fallback is the ReelSpy prod project.
const CLARITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || "xuzukpwv8n";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "ReelSpy — Content Intelligence",
    template: "%s · ReelSpy",
  },
  description,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    siteName: "ReelSpy",
    title: "ReelSpy — Content Intelligence",
    description,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ReelSpy — Content Intelligence",
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // Second argument: a first-time visitor arriving from the marketing zone has
  // no prefs cookie yet, so inherit the language they were just reading in.
  const { locale } = parsePrefs(
    cookieStore.get(PREFS_COOKIE)?.value,
    cookieStore.get(LANDING_LOCALE_COOKIE)?.value
  );
  const colorTheme = normalizeColorTheme(cookieStore.get(THEME_COOKIE)?.value);
  // Only fire Clarity once the visitor has accepted cookies (mirrored by
  // CookieConsent into this cookie); no consent yet means no script.
  const analyticsConsent = cookieStore.get("cookie_consent")?.value === "accepted";

  return (
    <html
      lang={locale}
      dir={dirForLocale(locale)}
      // Always stamped: the default (volt) has its own CSS block, and "mono"
      // has none, so an unknown value degrades gracefully to base tokens.
      data-theme={colorTheme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {analyticsConsent && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
          </Script>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider locale={locale}>
            {children}
            <CookieConsent />
            {/* Mirror the toast corner in RTL so it sits on the same visual side. */}
            <Toaster
              position={dirForLocale(locale) === "rtl" ? "top-left" : "top-right"}
              richColors
              closeButton
            />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
