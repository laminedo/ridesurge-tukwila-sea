import type { NextConfig } from "next";

// Stamped into the service-worker URL so every build installs fresh caches.
const buildId = Date.now().toString(36);

/**
 * `GITHUB_PAGES=1` produces a static export for GitHub Pages. Pages cannot run
 * a server, so that build leaves out the API routes (`route.api.ts` is only a
 * route when "api.ts" is a page extension) and the app computes its snapshot
 * in the browser instead.
 */
const pages = process.env.GITHUB_PAGES === "1";
const basePath = pages ? (process.env.PAGES_BASE_PATH ?? "/ridesurge-tukwila-sea") : "";

const shared: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC_EXPORT: pages ? "1" : "",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const staticSite: NextConfig = {
  ...shared,
  output: "export",
  // With `output: "export"` the finished site is written to distDir.
  distDir: "out",
  basePath,
  pageExtensions: ["tsx", "ts"],
};

const server: NextConfig = {
  ...shared,
  cacheComponents: true,
  partialPrefetching: true,
  pageExtensions: ["api.ts", "tsx", "ts"],
  async headers() {
    return [
      {
        // Pages, API routes and public files. Next's own /_next assets set their own headers.
        source: "/((?!_next/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default pages ? staticSite : server;
