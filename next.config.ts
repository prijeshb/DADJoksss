import type { NextConfig } from "next";
import crypto from "crypto";

const nextConfig: NextConfig = {
  // Bake a unique build ID at build time so all deployment targets get a fresh SW cache name
  env: {
    BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      crypto.randomUUID(),
  },
  async rewrites() {
    return [
      {
        source: "/sw.js",
        destination: "/api/sw",
      },
    ];
  },
};

export default nextConfig;
