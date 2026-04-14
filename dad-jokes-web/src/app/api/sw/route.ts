import { NextResponse } from "next/server";

// BUILD_ID is injected at build time via next.config.ts env block — unique per deployment.
// Sanitize to alphanumeric + safe chars before embedding in a JS string literal.
const RAW_BUILD_ID = process.env.BUILD_ID ?? "dev";
const BUILD_ID = RAW_BUILD_ID.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || "dev";

const swContent = `const CACHE_NAME = 'dadjoksss-${BUILD_ID}';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/manifest.json']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache API routes — they may carry auth-sensitive or user-specific data
  if (url.pathname.startsWith('/api/')) return;

  // Network-first: try fresh, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;

export function GET() {
  return new NextResponse(swContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
