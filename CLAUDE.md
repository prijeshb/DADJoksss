# DADjoksss — Claude Project Context

## Stack
- **Framework**: Next.js 15 (App Router, server components)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **State**: Zustand with localStorage persistence
- **Testing**: Vitest + v8 coverage
- **Runtime**: Node.js (no Python backend — all API routes are Next.js route handlers)

## Dev Setup
```bash
npm install          # install deps (node_modules already present, skip if unchanged)
npm run dev          # starts on http://localhost:3333
npm test             # vitest run
npm test -- --coverage  # with coverage report
npm run build        # production build
```

## Project Structure
```
src/
  app/
    page.tsx                    # Home — joke swipe feed
    dashboard/
      page.tsx                  # Server component — auth gate
      PinGate.tsx               # Client — PIN entry form
      DashboardContent.tsx      # Client — analytics dashboard
    api/
      dashboard-auth/route.ts   # POST — verify PIN, set HttpOnly cookie
      jokes/route.ts            # GET  — serve jokes with language filter
      analytics/route.ts        # POST — track events
      ab-test/route.ts          # GET/POST — A/B test management
      sw/route.ts               # GET  — serve dynamic service worker JS
  components/
    JokeCard.tsx                # Swipeable joke card (front + back)
    SwipeStack.tsx              # Card stack with swipe logic
    LanguageFilter.tsx          # English / Hinglish toggle
    TimerCircle.tsx             # Countdown timer UI
    AnswerOptions.tsx           # Multiple choice answers
    ABTestPanel.tsx             # Dashboard A/B test panel
    ServiceWorker.tsx           # PWA service worker registration
  data/jokes.ts                 # Static joke dataset
  lib/
    types.ts                    # Shared TypeScript types
    store.ts                    # Zustand stores (analytics, session, feed)
    dashboard-auth.ts           # HMAC token helpers (shared by route + page)
public/
  sw.js                         # Static SW fallback
  manifest.json                 # PWA manifest
  icon.svg
```

## Environment Variables
```
DASHBOARD_PIN=      # Required. Dashboard access PIN (min 6 chars recommended)
BUILD_ID=           # Optional. Set by CI/Vercel for SW cache busting
```
`.env.local` is gitignored. Copy from a teammate or set manually.

## Auth Architecture
- Dashboard (`/dashboard`) is a **server component** — verifies `dash_session` cookie before rendering
- Cookie is `HttpOnly; SameSite=Strict; path=/dashboard; maxAge=8h`
- Set by `POST /api/dashboard-auth` after PIN verification (HMAC-SHA256)
- Rate limited: 5 attempts / IP / 15 min
- If `DASHBOARD_PIN` is not set → 503 (fail-closed)

## Branch Strategy
- `main` — stable, deployable
- `feature/*` — new features
- `fix/*` — bug/security fixes
- PRs always target `main`

## Git Rules
- No security-related info in commit messages or PR descriptions
- No sensitive words: pin, password, secret, token, key, auth, jwt
- Describe behavior, not mechanism: "server-side cookie verification" not "fix auth bypass"
- Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `refactor:`

## Testing Rules
- Run `npm test -- --coverage` before every commit on auth/security code
- Auth code must maintain ≥ 97% coverage (`src/lib/dashboard-auth.ts` = 100%)
- Vitest excludes `.claude/` worktrees (configured in `vitest.config.ts`)

## Code Style
- Immutable patterns — never mutate state directly
- No `any` in TypeScript
- Components < 200 lines, files < 800 lines
- One component per file
- No `alert()` / `window.confirm()` — use inline UI
- No hardcoded secrets — always use env vars

## Open Branches
- `feature/hide-dashboard-menu` — removes dashboard link from footer UI
- `fix/dashboard-auth-cookie` — replaces sessionStorage auth with HttpOnly cookie + rate limiting

## Deployment
- Target: Vercel
- Set `DASHBOARD_PIN` in Vercel environment variables (never commit)
- `BUILD_ID` is auto-set by Vercel (`VERCEL_GIT_COMMIT_SHA`)
