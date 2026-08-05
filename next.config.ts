import type { NextConfig } from "next";

const scriptSources = process.env.NODE_ENV === "development"
  ? "'self' 'unsafe-inline' 'unsafe-eval' https://open.spotify.com https://sdk.scdn.co"
  : "'self' 'unsafe-inline' https://open.spotify.com https://sdk.scdn.co";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.scdn.co https://mosaic.scdn.co https://jiielydvjjjkhtxmfrts.supabase.co; frame-src https://open.spotify.com https://sdk.scdn.co; connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://*.spotify.com wss://*.spotify.com https://lrclib.net https://jiielydvjjjkhtxmfrts.supabase.co wss://jiielydvjjjkhtxmfrts.supabase.co; media-src 'self' blob: https://*.scdn.co https://*.spotifycdn.com; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` },
    ] }];
  },
  images: { remotePatterns: [
    { protocol: "https", hostname: "i.scdn.co" },
    { protocol: "https", hostname: "mosaic.scdn.co" },
    { protocol: "https", hostname: "jiielydvjjjkhtxmfrts.supabase.co" },
  ] },
};

export default nextConfig;
