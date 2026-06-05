import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the yt-dlp static binary into the transcript route's serverless
  // function so it can be spawned at runtime.
  outputFileTracingIncludes: {
    "/api/reels/[reel_id]/transcript": ["./bin/yt-dlp_linux"],
    "/api/reels/diag": ["./bin/yt-dlp_linux"],
    "/api/reels/durations": ["./bin/yt-dlp_linux"],
  },
};

export default nextConfig;
