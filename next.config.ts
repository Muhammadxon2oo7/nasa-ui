import type { NextConfig } from "next";

/**
 * Backend origin for the /py proxy. A public backend must be reached over https: its nginx answers
 * http with a 301, and a redirected POST arrives as GET (405), which silently pushed every analysis
 * onto the slow built-in fallback in production. Local backends (localhost, 127.0.0.1) keep http.
 */
function backendUrl() {
  const raw = (process.env.BACKEND_URL ?? "https://agro-nasa-api.e-investment.uz").trim().replace(/\/+$/, "");
  const local = /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/.test(raw);
  return local ? raw : raw.replace(/^http:\/\//, "https://");
}


const nextConfig: NextConfig = {
  // FastAPI backend (nasa_agro). Proxied through /py/* so the browser never needs CORS.
  async rewrites() {
    return [{ source: "/py/:path*", destination: `${backendUrl()}/:path*` }];
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
