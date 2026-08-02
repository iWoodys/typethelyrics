import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: { remotePatterns: [
    { protocol: "https", hostname: "i.scdn.co" },
    { protocol: "https", hostname: "mosaic.scdn.co" },
    { protocol: "https", hostname: "jiielydvjjjkhtxmfrts.supabase.co" },
  ] },
};

export default nextConfig;
