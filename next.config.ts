import type { NextConfig } from "next";

// Skip env validation during `next build` — env vars are only available at runtime.
process.env.SKIP_ENV_VALIDATION = "true";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
