import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async redirects() {
    return [{ source: "/law/:congress/:type/:number", destination: "/bill/:congress/:type/:number", permanent: true }];
  },
  cacheComponents: true,
  cacheLife: {
    // Vote feeds, Top Stories and the Court: see lib/live.ts.
    live: { stale: 300, revalidate: 30 * 60, expire: 24 * 60 * 60 },
  },
  partialPrefetching: true,
};

export default nextConfig;
