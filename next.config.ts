import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FastAPI backend (nasa_agro). Proxied through /py/* so the browser never needs CORS.
  async rewrites() {
    return [{ source: "/py/:path*", destination: `${process.env.BACKEND_URL ?? "https://agro-nasa-api.e-investment.uz"}/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
