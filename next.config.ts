import type { NextConfig } from "next";

/**
 * Static export so the app can be hosted on any static host (e.g. GitHub Pages).
 * Set PAGES_BASE_PATH (e.g. "/ats-system") when serving from a sub-path.
 */
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
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
