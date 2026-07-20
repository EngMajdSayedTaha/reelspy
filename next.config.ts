import type { NextConfig } from "next";

// Baseline security headers for every response. A strict Content-Security-Policy
// is intentionally not set here yet — it needs nonce wiring through the root
// layout to avoid breaking Next's inline runtime scripts.
const securityHeaders = [
  // Browsers must never MIME-sniff responses into executable types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app has no legitimate embedding use case — block clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // This app is the SECONDARY zone behind reelspy.dev: the landing project owns
  // the domain and proxies every product route here (see its DASHBOARD_ZONE_PATHS).
  //
  // Static assets need their own non-colliding path, because both zones would
  // otherwise serve /_next/* and the proxied HTML would fetch its JS from the
  // landing deployment. Next serves its own assets under the prefix, and the
  // landing rewrites /dashboard-static/* back here.
  //
  // assetPrefix only changes the URLs Next EMITS — it does not make the server
  // respond at that prefix. The rewrite below maps the prefixed URLs back onto
  // the real /_next/* files, and the middleware matcher excludes the prefix so
  // it cannot redirect a chunk request to /login (which returns HTML where the
  // browser expects JS, and takes the whole page down with a hydration error).
  //
  // Deliberately NOT basePath: every route must keep its real path, since
  // Supabase redirect URLs, the Stripe webhook and the Vercel crons all point
  // at /auth/*, /api/* etc. Only in production — a bare `next dev` has no proxy
  // in front of it.
  assetPrefix: process.env.NODE_ENV === "production" ? "/dashboard-static" : undefined,
  // Bundle the yt-dlp static binary into the transcript route's serverless
  // function so it can be spawned at runtime.
  outputFileTracingIncludes: {
    "/api/reels/[reel_id]/transcript": ["./bin/yt-dlp_linux"],
    "/api/reels/diag": ["./bin/yt-dlp_linux"],
  },
  async rewrites() {
    return {
      // beforeFiles so the prefixed request resolves to the real asset before
      // any filesystem route or dynamic segment gets a chance to claim it.
      beforeFiles: [
        { source: "/dashboard-static/_next/:path*", destination: "/_next/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
