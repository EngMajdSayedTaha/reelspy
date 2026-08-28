// The "handing you to the provider" page.
//
// WHY A PAGE INSTEAD OF A BARE 307
// --------------------------------
// The connect route used to answer with a naked redirect to the provider's
// consent dialog. When that navigation succeeds, great. When it does NOT — and
// on a phone it frequently does not — the user is left staring at a browser
// that is "loading something" with nothing on screen, no error, and no way back
// except the back button. There is nothing to read, nothing to tap, and nothing
// in our logs either, because the request never reached us.
//
// Confirmed causes of a provider dialog that renders nothing:
//   * Privacy browsers. Brave's Shields include Facebook-login blocking and
//     script blocking; with either active, facebook.com/dialog/oauth paints a
//     blank page. This is what this user hit — production logs show five
//     correct 307s to Facebook and zero callbacks.
//   * Content blockers / DNS-level blocklists (AdGuard, Pi-hole, some carrier
//     and corporate DNS) that null-route facebook.com.
//   * Embedded WebViews. Facebook refuses OAuth inside an in-app browser, which
//     presents as a blank or immediately-closing view.
//   * Flaky mobile networks dropping the cross-origin navigation entirely.
//
// None of those are fixable from the server — but "the user is stranded with no
// information" is. So the redirect now happens FROM a page we control:
//
//   1. It redirects immediately (location.replace, plus a <meta refresh>
//      fallback for a no-JS browser), so a healthy flow is unchanged apart from
//      one extra same-origin hop.
//   2. It leaves a sessionStorage marker before it goes. If the user comes back
//      to this page — which is exactly what happens when they hit back off a
//      blank provider page — the marker (or a bfcache restore) suppresses the
//      auto-redirect and shows troubleshooting instead of bouncing them into
//      the same void again.
//   3. The manual link is always in the DOM, so even the no-JS path has
//      something to tap.
//
// The result: a blocked provider dialog becomes a page that explains itself,
// rather than a browser that appears to hang.

import type { Locale } from "@/lib/i18n/config";

export type InterstitialCopy = {
  title: string;
  connecting: string;
  manualCta: string;
  stuckHeading: string;
  stuckBody: string;
  tips: string[];
  backCta: string;
};

const COPY: Record<"en" | "ar", (provider: string) => InterstitialCopy> = {
  en: (provider) => ({
    title: `Continue to ${provider}`,
    connecting: `Taking you to ${provider}…`,
    manualCta: `Continue to ${provider}`,
    stuckHeading: `${provider} didn't load`,
    stuckBody:
      `Your browser opened ${provider} but you ended up back here. Either ${provider} showed an ` +
      `error, or your browser refused to load it. Here's how to tell which:`,
    tips: [
      `If ${provider} showed "URL Blocked — the redirect URI is not whitelisted", that is a server configuration problem on our side, not yours. Nothing you change in your browser will help — please report it and we'll fix the app settings.`,
      `If you use Brave: tap the lion icon and turn Shields DOWN for this site, then enable Settings → Brave Shields & privacy → Social media blocking → "Allow Facebook logins".`,
      `Turn off any ad blocker, content blocker or private-DNS filter for ${provider.toLowerCase()}.com and try again.`,
      `Or just open this page in a different browser (Chrome, Safari, Firefox) and connect there — the connection is saved to your account, not to the browser.`,
      `If you opened ReelSpy from inside another app (Instagram, Messenger, Gmail), open it in a real browser instead — ${provider} blocks sign-in inside in-app browsers.`,
    ],
    backCta: "Back to Connections",
  }),
  ar: (provider) => ({
    title: `المتابعة إلى ${provider}`,
    connecting: `جارٍ نقلك إلى ${provider}…`,
    manualCta: `المتابعة إلى ${provider}`,
    stuckHeading: `لم يتم تحميل ${provider}`,
    stuckBody:
      `فتح متصفحك ${provider} لكنك عدت إلى هنا. إمّا أن ${provider} أظهر رسالة خطأ، أو أن متصفحك رفض تحميله. ` +
      `إليك كيف تعرف السبب:`,
    tips: [
      `إذا أظهر ${provider} رسالة "URL Blocked — the redirect URI is not whitelisted"، فهذه مشكلة في إعدادات الخادم لدينا وليست لديك. لن يفيد تغيير أي شيء في متصفحك — يرجى إبلاغنا وسنصلح إعدادات التطبيق.`,
      `إذا كنت تستخدم Brave: اضغط على أيقونة الأسد وأوقف الدروع (Shields) لهذا الموقع، ثم فعّل الإعدادات ← Brave Shields & privacy ← Social media blocking ← "Allow Facebook logins".`,
      `أوقف أي مانع إعلانات أو حاجب محتوى أو فلترة DNS خاصة بالنسبة إلى ${provider.toLowerCase()}.com ثم أعد المحاولة.`,
      `أو افتح هذه الصفحة في متصفح آخر (Chrome أو Safari أو Firefox) واربط حسابك من هناك — يُحفظ الربط في حسابك وليس في المتصفح.`,
      `إذا فتحت ReelSpy من داخل تطبيق آخر (إنستغرام، ماسنجر، جيميل)، افتحه في متصفح حقيقي — ${provider} يحظر تسجيل الدخول داخل المتصفحات المدمجة.`,
    ],
    backCta: "العودة إلى الاتصالات",
  }),
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type InterstitialOptions = {
  /** The provider's consent-dialog URL to send the browser to. */
  authorizeUrl: string;
  /** Human name shown in the copy ("Facebook", "TikTok", "YouTube"). */
  provider: string;
  locale: Locale;
  /** Where "Back" returns to. */
  backHref?: string;
  /** Distinguishes concurrent flows' sessionStorage markers. */
  flow: string;
};

export function renderOAuthInterstitial({
  authorizeUrl,
  provider,
  locale,
  backHref = "/dashboard/connections",
  flow,
}: InterstitialOptions): string {
  const copy = (COPY[locale === "ar" ? "ar" : "en"] ?? COPY.en)(provider);
  const rtl = locale === "ar";
  // Two contexts, two encodings:
  //  - HTML attributes (<meta refresh>, <a href>): HTML-escape, so "&" → "&amp;"
  //    and the browser decodes it back on navigation.
  //  - the JS string literal `var URL_ = '…'` below: HTML-escaping is WRONG here.
  //    location.replace() does NOT decode entities, so "&amp;" would reach the
  //    provider as the literal text "&amp;redirect_uri=…" — a bogus parameter
  //    name. Facebook/TikTok/YouTube shrug the junk params off (they fall back to
  //    defaults); Instagram Login requires redirect_uri + response_type
  //    explicitly and rejects the whole request. So escape only what would
  //    terminate the string or break out of the <script> element.
  const safeUrl = escapeHtml(authorizeUrl);
  const jsUrl = authorizeUrl
    .replace(/[\r\n\u2028\u2029]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/</g, "\\u003c");
  const markerKey = escapeHtml(`reelspy_oauth_attempt_${flow}`);

  return `<!doctype html>
<html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.title)}</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #0b0b0d; color: #e8e8ea;
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card { width: 100%; max-width: 460px; }
  .spinner {
    width: 26px; height: 26px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.18); border-top-color: #f9e400;
    animation: spin .8s linear infinite; margin-bottom: 18px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
  h1 { font-size: 18px; margin: 0 0 8px; font-weight: 600; }
  p { margin: 0 0 16px; color: #a1a1aa; }
  ul { margin: 0 0 20px; padding-inline-start: 20px; color: #a1a1aa; }
  li { margin-bottom: 10px; }
  .btn {
    display: inline-block; background: #f9e400; color: #121212; text-decoration: none;
    padding: 11px 20px; border-radius: 10px; font-weight: 600; font-size: 14px;
  }
  .link { display: inline-block; margin-inline-start: 14px; color: #a1a1aa; font-size: 14px; }
  [hidden] { display: none !important; }
</style>
<noscript><meta http-equiv="refresh" content="0;url=${safeUrl}"></noscript>
</head>
<body>
<div class="card">
  <div id="go">
    <div class="spinner" aria-hidden="true"></div>
    <h1>${escapeHtml(copy.connecting)}</h1>
    <p><a class="btn" href="${safeUrl}" rel="noopener">${escapeHtml(copy.manualCta)}</a></p>
  </div>

  <div id="stuck" hidden>
    <h1>${escapeHtml(copy.stuckHeading)}</h1>
    <p>${escapeHtml(copy.stuckBody)}</p>
    <ul>${copy.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    <p>
      <a class="btn" href="${safeUrl}" rel="noopener">${escapeHtml(copy.manualCta)}</a>
      <a class="link" href="${escapeHtml(backHref)}">${escapeHtml(copy.backCta)}</a>
    </p>
  </div>
</div>
<script>
(function () {
  var URL_ = '${jsUrl}';
  var KEY = '${markerKey}';

  function showStuck() {
    document.getElementById('go').hidden = true;
    document.getElementById('stuck').hidden = false;
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  // Returning to this page means the provider dialog went nowhere — the user
  // backed out of a blank page. Never bounce them into it a second time.
  var returned = false;
  try { returned = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (returned) { showStuck(); return; }

  // bfcache restore is the same signal on browsers that keep the page alive.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) showStuck();
  });

  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  // replace(), not assign(): keep this hop out of history so Back from the
  // provider returns to Connections, not to a redirect loop.
  setTimeout(function () { window.location.replace(URL_); }, 150);
})();
</script>
</body>
</html>`;
}
