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
  },
};

export default nextConfig;
