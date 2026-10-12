import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `serverExternalPackages: ["postgres"]` used to sit here, and under
  // Turbopack it broke every server render: the external was emitted as a
  // hashed specifier (`postgres-3f98aac8…`) that nothing could resolve, so
  // both `next build` and `next dev` died with ERR_MODULE_NOT_FOUND on any
  // route that touches the database.
  //
  // The opt-out exists for packages that break when bundled — native
  // bindings, dynamic requires, `__dirname` lookups. `postgres` is none of
  // those: it is pure JavaScript with no dependencies, no gypfile and no
  // binary, and it bundles cleanly. The entry had been here since the initial
  // commit without a reason recorded, so it looks inherited from a template
  // rather than added to fix anything.
  //
  // If a future driver genuinely needs excluding, add that one — not this one.
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
