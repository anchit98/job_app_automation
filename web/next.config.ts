import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  experimental: {
    // Keep visited pages in the client router cache. Mutations that call
    // revalidatePath still refresh; plain revisits reuse the cached RSC tree.
    staleTimes: {
      dynamic: 3600,
      static: 86400,
    },
  },
};

export default nextConfig;
