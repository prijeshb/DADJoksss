import type { NextConfig } from "next";
import crypto from "crypto";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Use deployment ID if available; never expose the git commit SHA to the client bundle
  env: {
    BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ??
      crypto.randomUUID(),
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS: tell browsers to always use HTTPS for 1 year, include subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline' is required by Next.js App Router for hydration scripts until
              // per-request nonces are wired up via middleware. 'unsafe-eval' is dev-only.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
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
