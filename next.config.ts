import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async redirects() {
    return [{ source: "/law/:congress/:type/:number", destination: "/bill/:congress/:type/:number", permanent: true }];
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
