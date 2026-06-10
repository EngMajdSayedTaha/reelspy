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
  // Bundle the yt-dlp static binary into the transcript route's serverless
  // function so it can be spawned at runtime.
  outputFileTracingIncludes: {
    "/api/reels/[reel_id]/transcript": ["./bin/yt-dlp_linux"],
    "/api/reels/diag": ["./bin/yt-dlp_linux"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
