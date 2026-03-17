# DADjoksss — Project Context

## Overview
A PWA (Progressive Web App) for dad jokes — swipeable cards, bilingual (English + Hinglish), with a hidden analytics dashboard.

## Stack
- Next.js 15 App Router · TypeScript · Tailwind CSS v4 · Framer Motion
- Zustand (client-side state + localStorage persistence)
- Vitest (unit tests) · No database — static joke dataset

## Business Goals
- Fun, shareable dad joke experience
- Bilingual reach (English + Hinglish)
- Owner-only analytics dashboard (PIN-gated)
- PWA: installable, works offline

## Existing Features
- Swipeable joke card stack with flip animation
- Multiple-choice answer options per joke
- Countdown timer per card (20s)
- Language filter (English / Hinglish / Mix)
- Like + Share buttons with micro-animations
- Analytics tracking (impressions, likes, shares, time-on-card)
- Dashboard: overview stats, jokes table, A/B test panel, feed algorithm weights
- A/B test framework (feed variants)
- PWA: service worker, offline cache, installable manifest
- Dashboard PIN gate — server-side `HttpOnly` cookie auth

## Architecture Decisions
- **No backend server** — Next.js API routes only
- **Client-side analytics** — Zustand + localStorage (no server DB)
- **Static joke data** — `src/data/jokes.ts` (no CMS)
- **Dashboard hidden from UI** — accessible only via `/dashboard` URL + PIN

## Security Status
- Last audit: 2026-03-16
- Dashboard auth: server-verified HttpOnly cookie (HMAC-SHA256)
- Rate limiting: 5 attempts / IP / 15 min on auth endpoint
- Fail-closed: missing `DASHBOARD_PIN` → 503
- Open issues: security headers (HIGH), analytics endpoint auth (HIGH), input validation on jokes API (MEDIUM)

## Test Status
- Last run: 2026-03-16
- Tests: 37 passing
- Coverage: 97.82% overall · dashboard-auth lib: 100%
- Verdict: PASS

## In Progress
- `feature/hide-dashboard-menu` — remove dashboard link from footer, keep URL accessible
- `fix/dashboard-auth-cookie` — server-side cookie auth replacing sessionStorage

## File Locations
| Concern | Path |
|---|---|
| Joke data | `src/data/jokes.ts` |
| Zustand stores | `src/lib/store.ts` |
| Types | `src/lib/types.ts` |
| Auth helpers | `src/lib/dashboard-auth.ts` |
| Dashboard page | `src/app/dashboard/page.tsx` |
| Auth API | `src/app/api/dashboard-auth/route.ts` |
| Jokes API | `src/app/api/jokes/route.ts` |

## Environment
```
DASHBOARD_PIN=   # required
BUILD_ID=        # optional, set by Vercel
```

## Deployment
- Platform: Vercel
- Port (dev): 3333
- `npm run dev` to start locally
