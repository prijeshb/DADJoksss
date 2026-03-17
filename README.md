# DADjoksss 😂

A bilingual dad jokes PWA — swipe through English and Hinglish jokes, guess the punchline, share with friends.

## Features

- 🃏 Swipeable joke cards with flip animation
- 🤔 Multiple-choice answers with countdown timer
- 🌐 English + Hinglish jokes
- ❤️ Like & share with micro-animations
- 📲 Installable PWA (works offline)
- 📊 Hidden analytics dashboard

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # set DASHBOARD_PIN
npm run dev
```

Open [http://localhost:3333](http://localhost:3333).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DASHBOARD_PIN` | Yes | PIN to access `/dashboard` |
| `BUILD_ID` | No | Auto-set by Vercel for cache busting |

## Dashboard

Analytics dashboard is accessible at `/dashboard` — not linked from the UI.
Requires PIN entry on first visit. Session lasts 8 hours.

## Tech Stack

- [Next.js 15](https://nextjs.org/) — App Router + server components
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Zustand](https://zustand-demo.pmnd.rs/) — client state

## Development

```bash
npm run dev        # dev server on :3333
npm test           # run tests
npm run build      # production build
npm run lint       # eslint
```

## Deployment

Deploy to [Vercel](https://vercel.com). Set `DASHBOARD_PIN` in Vercel environment variables.
