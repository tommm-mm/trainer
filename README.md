# Trainer

Single-user AI personal trainer. Next.js (App Router) + Supabase + Vercel + Claude API.
Principle: **automate the plumbing, never the judgment**. AI plans stay `proposed` until you approve them in the UI.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold, Supabase auth, login | ✅ |
| 2 | Week View, Log Workout, Goal Overview, seed goal | ⏳ |
| 3 | Check-in, Analytics | ⏳ |
| 4 | Stub `/api/generate-week` | ⏳ |
| 5 | intervals.icu sync | ⏳ |
| 6 | Real Claude call + flags | ⏳ |
| 7 | Vercel Cron (2x/week) | ⏳ |
| 8 | PWA manifest/icons | ⏳ |

## Structure

```
src/
  proxy.ts                  # Next 16 "proxy" (formerly middleware): session refresh + auth gate
  lib/supabase/client.ts    # browser client
  lib/supabase/server.ts    # server client (Server Components / Actions)
  lib/supabase/proxy.ts     # updateSession() used by src/proxy.ts
  lib/database.types.ts     # types generated from the live schema
  app/login/                # email/password sign-in (no signup)
  app/page.tsx              # Week View (placeholder in Phase 1)
  components/bottom-nav.tsx
```

## Local dev

```bash
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Env vars

| Name | Where | Phase |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (set) | 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (set) | 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | 5 |
| `INTERVALS_ICU_API_KEY` | Vercel, server only | 5 |
| `ANTHROPIC_API_KEY` | Vercel, server only | 6 |

## Account (single user)

There is no signup page. Create the one account in Supabase:
Authentication → Users → **Add user** (email + password, *Auto Confirm User* on).
Then Authentication → Sign In / Providers → turn off **Allow new users to sign up**.
