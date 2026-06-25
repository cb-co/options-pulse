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
curl -X POST http://localhost:3000/api/cron/gex-snapshot \
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

- **Anon role** (client-side Supabase client): used for public reads of `option_snapshots` and `gex_snapshots`. RLS allows anon reads on these tables.
- **Service role** (server-side, never exposed to browser): used by the cron job API route for all writes. Import via `createClient(url, SUPABASE_SERVICE_ROLE_KEY)`.
- `profiles` and `watchlist_items`: user can only access their own rows (RLS by `auth.uid()`).

### Data pipeline flow (daily cron)

`/api/cron/gex-snapshot` runs this sequence:
1. Build ticker list = 18 fixed universe tickers ∪ distinct tickers from `watchlist_items`
2. For each ticker: `getOptionChain()` → store contracts in `option_snapshots` → `computeGex()` → upsert into `gex_snapshots`
3. Add ~400ms delay between ticker fetches; catch per-ticker errors and skip rather than aborting the whole job
4. Protect endpoint by checking `Authorization: Bearer <CRON_SECRET>` header

**GEX computation** (see `lib/gex.ts`):
- Black-Scholes gamma per contract: `d1 = [ln(S/K) + (r + σ²/2)·T] / (σ·√T)`, `Γ = φ(d1) / (S·σ·√T)`
- Strike-level GEX: calls positive, puts negative, multiplied by OI × 100 × S²
- Aggregate outputs: `net_gex`, `abs_gex`, `regime`, `call_wall`, `put_wall`, `zero_gamma`, `put_call_ratio`, `iv_skew`

### Fixed ticker universe

```ts
// lib/constants.ts
export const FIXED_UNIVERSE = [
  'SPY','QQQ','IWM','AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA',
  'AMD','AVGO','NFLX','COIN','PLTR','MSTR','TQQQ','SOXL'
]
```

### Stripe integration

- One product, one price: `STRIPE_PRICE_ID` env var (set in Stripe dashboard)
- Webhook at `/api/stripe/webhook` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → update `profiles.subscription_status`
- Customer Portal (no custom billing UI): `/api/stripe/portal` creates a portal session and redirects

### Cron schedule

Vercel Cron config in `vercel.json`: `"0 21 * * 1-5"` (21:00 UTC, weekdays only — ~4pm ET in summer, ~4:30pm ET in winter, runs after market close to capture final OI).

## Key conventions

- **Legal disclaimer** must appear in the footer and near every GEX display: *"OptionPulse computes Gamma Exposure (GEX) from publicly available options data for informational and educational purposes only. GEX is a derived metric, not a forecast. Nothing here is investment advice or a recommendation to buy or sell any security."*
- Flatten option chains to **next 6 expirations** (0DTE + weekly + monthly coverage)
- `gex_snapshots` table uses `upsert` on `(snapshot_date, ticker)` unique constraint — safe to re-run the cron
- `/movers` shows all tickers ordered by `abs_gex desc` — no auth required

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_GEX_RISK_FREE_RATE=0.05   # US 3-month T-bill rate for Black-Scholes gamma (NEXT_PUBLIC so client and server use the same value)

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
CRON_SECRET=
```
