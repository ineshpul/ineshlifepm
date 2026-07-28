import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    return [
      // Apple Calendar subscriptions like a literal .ics suffix; the route
      // itself lives at /api/calendar/[token] (App Router can't mix a
      // literal suffix into a dynamic segment folder name).
      { source: "/api/calendar/:token.ics", destination: "/api/calendar/:token" },
    ];
  },
};

export default nextConfig;
