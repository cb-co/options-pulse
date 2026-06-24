# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx supabase start   # Start local Supabase (Docker required)
npx supabase db push # Apply migrations to remote
npx supabase gen types typescript --local > types/supabase.ts  # Regenerate DB types
```

Testing the cron job locally:
```bash
curl -X POST http://localhost:3000/api/cron/daily-digest \
  -H "Authorization: Bearer <CRON_SECRET value>"
```

## Architecture

**Next.js App Router** on Vercel with Supabase (Postgres + Auth) and Stripe for payments.

### Critical abstraction: `lib/marketData.ts`

**All** option chain fetching must go through `getOptionChain(ticker: string): Promise<OptionChainData>` in this single module. Currently backed by `yahoo-finance2` (no API key). This is the designated swap point for the TradeStation API — nothing else in the codebase should import from `yahoo-finance2` directly.

### Auth & access control

- **Magic link only** — no passwords, no password reset UI. Supabase Auth handles OTP email.
- On first dashboard load, create the `profiles` row if it doesn't exist (no trigger needed, just check-and-insert in app logic).
- Three tiers drive all feature gating: `subscription_status` on `profiles` — `'free'` | `'active'` | `'canceled'` | `'past_due'`. Treat `'canceled'` and `'past_due'` as free-tier access.
- Free tier: 1 watchlist ticker max. Enforce in application logic before insert (check profile status + count), not at DB level.
- Paid tier gates: unlimited watchlist + `/dashboard/history`.

### Database access pattern

- **Anon role** (client-side Supabase client): used for public reads of `option_snapshots` and `digests`. RLS allows anon reads on these tables.
- **Service role** (server-side, never exposed to browser): used by the cron job API route for all writes. Import via `createClient(url, SUPABASE_SERVICE_ROLE_KEY)`.
- `profiles` and `watchlist_items`: user can only access their own rows (RLS by `auth.uid()`).

### Data pipeline flow (daily cron)

`/api/cron/daily-digest` runs this sequence:
1. Build ticker list = 18 fixed universe tickers ∪ distinct tickers from `watchlist_items`
2. For each ticker: `getOptionChain()` → store contracts in `option_snapshots` → compute signals → call Claude for narrative → upsert into `digests`
3. Add 300–500ms delay between ticker fetches; catch per-ticker errors and skip rather than aborting the whole job
4. Protect endpoint by checking `x-cron-secret` header matches `CRON_SECRET` env var

**Signal computation** (see brief Section 5 for full detail):
- Day-1 always: `put_call_ratio`, `vol_oi_ratio` (top 3 contracts), `iv_skew`
- Day-2+: `volume_change`, `oi_change`, `iv_change` vs. yesterday's snapshot
- Unusualness score = `max(vol_oi_ratio) + abs(put_call_ratio - 0.7) * 2 + max(abs(iv_change)) * 5`

### Fixed ticker universe

```ts
// lib/constants.ts
export const FIXED_UNIVERSE = [
  'SPY','QQQ','IWM','AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA',
  'AMD','AVGO','NFLX','COIN','PLTR','MSTR','TQQQ','SOXL'
]
```

### AI narrative generation (`lib/ai.ts`)

The AI layer is model-agnostic via the Vercel AI SDK (`ai` package). Provider and model are controlled entirely by env vars — no code changes needed to swap:
- Set `AI_PROVIDER=anthropic|openai|google` and `AI_MODEL=<any valid model ID>`
- Provider SDKs: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`
- Each provider reads its API key from its standard env var automatically
- `generateNarrative(ticker, signals)` in `lib/ai.ts` is the single call site
- System prompt constrains to factual, neutral, 2-3 sentence summaries — no buy/sell recommendations
- Store result in `digests.narrative` — generate once per ticker per day, not per request

### Stripe integration

- One product, one price: `STRIPE_PRICE_ID` env var (set in Stripe dashboard)
- Webhook at `/api/stripe/webhook` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → update `profiles.subscription_status`
- Customer Portal (no custom billing UI): `/api/stripe/portal` creates a portal session and redirects

### Cron schedule

Vercel Cron config in `vercel.json`: `"0 21 * * 1-5"` (21:00 UTC, weekdays only — ~4pm ET in summer, ~4:30pm ET in winter, acceptable for EOD digest).

## Key conventions

- **Legal disclaimer** must appear in the footer and near every digest display: *"OptionPulse summarizes publicly observable options market activity for informational and educational purposes only. Nothing here is investment advice or a recommendation to buy or sell any security."*
- Flatten option chains to **next ~3 expirations** only — don't store the full chain
- `digests` table uses `upsert` on `(digest_date, ticker)` unique constraint — safe to re-run the cron job
- `/movers` shows top results ordered by `unusualness_score desc` — no auth required

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI — swap provider and model without touching code
AI_PROVIDER=anthropic           # anthropic | openai | google
AI_MODEL=claude-sonnet-4-6      # any model ID valid for the chosen provider
ANTHROPIC_API_KEY=              # required if AI_PROVIDER=anthropic
OPENAI_API_KEY=                 # required if AI_PROVIDER=openai
GOOGLE_GENERATIVE_AI_API_KEY=   # required if AI_PROVIDER=google

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
CRON_SECRET=
```
