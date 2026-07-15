"use client";

import { useEffect } from "react";
import { getClientPrefs } from "@/lib/prefs";
import { dirForLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Catches errors thrown in the root layout itself, so the layout's own
// `I18nProvider` may not have mounted — read the locale straight from the
// prefs cookie (client-safe, no context) instead of `useDict()`. Renders its
// own <html>/<body> and uses inline styles since app CSS may not be available
// at this level.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = getClientPrefs();
  const dict = getDictionary(locale);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} dir={dirForLocale(locale)}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101014",
          color: "#e4e4e7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 8px" }}>
            {dict.common.somethingWentWrong}
          </h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", margin: "0 0 20px" }}>
            {dict.errors.globalUnexpectedMessage}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#F9E400",
              color: "#000",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {dict.common.tryAgain}
          </button>
        </div>
      </body>
    </html>
  );
}
