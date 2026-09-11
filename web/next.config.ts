import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  experimental: {
    // Short cache only — a 1h dynamic staleTime made soft navigations feel
    // "stuck loading" when a refresh raced pipeline ticks for DB connections.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    serverActions: {
      // Master resume PDF upload. Default is 1MB, which rejects ordinary
      // resume PDFs with embedded fonts. Headroom over the 8MB action-side
      // cap covers multipart boundary/header overhead.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
