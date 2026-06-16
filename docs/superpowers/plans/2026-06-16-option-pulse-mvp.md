# OptionPulse MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build OptionPulse MVP — a daily AI-generated options activity digest with a public movers feed, personal watchlists, and Stripe subscription gating.

**Architecture:** Next.js 14 App Router on Vercel; Supabase for Postgres + magic-link auth; a model-agnostic AI layer via Vercel AI SDK (swap provider/model with two env vars); `yahoo-finance2` behind a single `getOptionChain()` abstraction (TradeStation swap point); Stripe for $9/mo subscriptions; one Vercel Cron job at 21:00 UTC on weekdays.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, `@supabase/ssr`, Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/google`), `yahoo-finance2`, `stripe`, Jest + `ts-jest`.

---

## File Map

| File | Responsibility |
|------|---------------|
| `supabase/migrations/0001_initial_schema.sql` | Full schema + RLS |
| `lib/supabase/client.ts` | Browser Supabase client (anon key) |
| `lib/supabase/server.ts` | Server Supabase client (cookie-based, RSC / route handlers) |
| `lib/supabase/admin.ts` | Service-role client for cron writes only |
| `lib/ai.ts` | `generateNarrative()` — model-agnostic, provider/model from env |
| `lib/marketData.ts` | `getOptionChain()` — the TradeStation swap point |
| `lib/signals.ts` | Pure signal computation functions |
| `lib/pipeline.ts` | Daily digest orchestration |
| `lib/stripe.ts` | Stripe singleton |
| `constants/tickers.ts` | `FIXED_UNIVERSE` array |
| `types/market.ts` | `OptionChainData`, `ContractData`, `SignalData` |
| `types/supabase.ts` | Generated DB types (via Supabase CLI) |
| `middleware.ts` | Redirect unauthenticated users away from `/dashboard` |
| `components/Disclaimer.tsx` | Legal disclaimer banner |
| `app/layout.tsx` | Root layout — disclaimer in footer |
| `app/page.tsx` | Landing page (top 3 movers teaser + CTA) |
| `app/movers/page.tsx` | Public Top Movers (full list) |
| `app/login/page.tsx` | Magic-link sign-in form |
| `app/auth/callback/route.ts` | Supabase auth code exchange |
| `app/dashboard/page.tsx` | Watchlist digests for logged-in user |
| `app/dashboard/watchlist/page.tsx` | Add/remove tickers |
| `app/dashboard/history/page.tsx` | Paid-only archive |
| `app/pricing/page.tsx` | Plan comparison + Checkout CTA |
| `app/account/page.tsx` | Subscription status + Portal link |
| `app/api/cron/daily-digest/route.ts` | Cron endpoint (secret-protected) |
| `app/api/stripe/checkout/route.ts` | Create Checkout session |
| `app/api/stripe/webhook/route.ts` | Handle Stripe lifecycle events |
| `app/api/stripe/portal/route.ts` | Create Customer Portal session |
| `__tests__/signals.test.ts` | Signal computation unit tests |
| `__tests__/pipeline.test.ts` | Pipeline logic unit tests |
| `jest.config.ts` | Jest config |
| `vercel.json` | Cron schedule |

---

## Task 1: Bootstrap Next.js project

**Files:**
- Create: project root (via `create-next-app`)
- Create: `jest.config.ts`
- Create: `.env.local`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /home/cm-corp/projects/option-pulse
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir no \
  --import-alias "@/*"
```

- [ ] **Step 2: Install all runtime and dev dependencies**

```bash
npm install \
  @supabase/ssr \
  @supabase/supabase-js \
  ai \
  @ai-sdk/anthropic \
  @ai-sdk/openai \
  @ai-sdk/google \
  yahoo-finance2 \
  stripe

npm install --save-dev \
  jest \
  ts-jest \
  @types/jest
```

- [ ] **Step 3: Create `jest.config.ts`**

```typescript
// jest.config.ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default config
```

- [ ] **Step 4: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Create `.env.local` with all required vars**

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-6
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
CRON_SECRET=
```

- [ ] **Step 6: Verify build is clean**

```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js project with dependencies"
```

---

## Task 2: Supabase project + schema

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`

- [ ] **Step 1: Install Supabase CLI and initialize**

```bash
npx supabase init
```

- [ ] **Step 2: Create migration file**

```bash
mkdir -p supabase/migrations
```

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
-- Profiles: extends auth.users with subscription info
create table profiles (
  id uuid references auth.users(id) primary key,
  email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'free',
  created_at timestamptz default now()
);

-- Watchlist items
create table watchlist_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  ticker text not null,
  created_at timestamptz default now(),
  unique (user_id, ticker)
);

-- Raw daily option chain snapshots
create table option_snapshots (
  id uuid default gen_random_uuid() primary key,
  snapshot_date date not null,
  ticker text not null,
  contract_symbol text not null,
  expiration date not null,
  strike numeric not null,
  option_type text not null,
  volume integer,
  open_interest integer,
  implied_volatility numeric,
  last_price numeric,
  created_at timestamptz default now(),
  unique (snapshot_date, contract_symbol)
);

-- Computed daily digest per ticker
create table digests (
  id uuid default gen_random_uuid() primary key,
  digest_date date not null,
  ticker text not null,
  unusualness_score numeric,
  signals jsonb,
  narrative text,
  created_at timestamptz default now(),
  unique (digest_date, ticker)
);

-- Indexes
create index on option_snapshots (ticker, snapshot_date);
create index on digests (digest_date, unusualness_score desc);
create index on digests (digest_date, ticker);

-- RLS
alter table profiles enable row level security;
alter table watchlist_items enable row level security;
alter table option_snapshots enable row level security;
alter table digests enable row level security;

-- profiles: own row only
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- watchlist_items: own rows only
create policy "Users can read own watchlist"
  on watchlist_items for select using (auth.uid() = user_id);
create policy "Users can insert own watchlist"
  on watchlist_items for insert with check (auth.uid() = user_id);
create policy "Users can delete own watchlist"
  on watchlist_items for delete using (auth.uid() = user_id);

-- option_snapshots and digests: public read, service-role write
create policy "Public read option_snapshots"
  on option_snapshots for select to anon using (true);
create policy "Public read digests"
  on digests for select to anon using (true);
```

- [ ] **Step 3: Apply migration to local Supabase (if running locally)**

```bash
npx supabase start
npx supabase db push
```

Expected: All tables created, no errors.

- [ ] **Step 4: Generate TypeScript types**

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

- [ ] **Step 5: Commit**

```bash
git add supabase/ types/supabase.ts
git commit -m "feat: add Supabase schema and generated types"
```

---

## Task 3: Core types, constants, and Supabase clients

**Files:**
- Create: `types/market.ts`
- Create: `constants/tickers.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create `types/market.ts`**

```typescript
// types/market.ts
export interface ContractData {
  symbol: string
  expiration: Date
  strike: number
  optionType: 'call' | 'put'
  volume: number | null
  openInterest: number | null
  impliedVolatility: number | null
  lastPrice: number | null
  underlyingPrice: number
}

export interface OptionChainData {
  ticker: string
  underlyingPrice: number
  contracts: ContractData[]
}

export interface SignalData {
  putCallRatio: number | null
  topVolOiContracts: Array<{
    symbol: string
    strike: number
    optionType: string
    volOiRatio: number
  }>
  ivSkew: number | null
  volumeChange?: Record<string, number>
  oiChange?: Record<string, number>
  ivChange?: Record<string, number>
}
```

- [ ] **Step 2: Create `constants/tickers.ts`**

```typescript
// constants/tickers.ts
export const FIXED_UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL',
  'META', 'TSLA', 'AMD', 'AVGO', 'NFLX', 'COIN', 'PLTR', 'MSTR',
  'TQQQ', 'SOXL',
] as const
```

- [ ] **Step 3: Create `lib/supabase/client.ts` (browser)**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

- [ ] **Step 4: Create `lib/supabase/server.ts` (RSC + route handlers)**

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create `lib/supabase/admin.ts` (service role — cron only)**

```typescript
// lib/supabase/admin.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add types/ constants/ lib/supabase/
git commit -m "feat: add core types, constants, and Supabase clients"
```

---

## Task 4: Signal computation — TDD

**Files:**
- Create: `lib/signals.ts`
- Create: `__tests__/signals.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/signals.test.ts`:

```typescript
import { ContractData, SignalData } from '@/types/market'
import {
  computePutCallRatio,
  computeTopVolOiContracts,
  computeIvSkew,
  computeUnusualnesScore,
  computeSignals,
} from '@/lib/signals'

const makeContract = (overrides: Partial<ContractData> = {}): ContractData => ({
  symbol: 'TEST240119C00150000',
  expiration: new Date('2024-01-19'),
  strike: 150,
  optionType: 'call',
  volume: 100,
  openInterest: 1000,
  impliedVolatility: 0.3,
  lastPrice: 5,
  underlyingPrice: 148,
  ...overrides,
})

describe('computePutCallRatio', () => {
  it('divides total put volume by total call volume', () => {
    const contracts = [
      makeContract({ optionType: 'call', volume: 200 }),
      makeContract({ optionType: 'put', volume: 100 }),
    ]
    expect(computePutCallRatio(contracts)).toBeCloseTo(0.5)
  })

  it('returns null when there is no call volume', () => {
    expect(computePutCallRatio([makeContract({ optionType: 'put', volume: 100 })])).toBeNull()
  })

  it('treats null volume as 0', () => {
    const contracts = [
      makeContract({ optionType: 'call', volume: null }),
      makeContract({ optionType: 'put', volume: 100 }),
    ]
    expect(computePutCallRatio(contracts)).toBeNull()
  })
})

describe('computeTopVolOiContracts', () => {
  it('returns top N contracts sorted by vol/OI ratio descending', () => {
    const contracts = [
      makeContract({ symbol: 'A', volume: 10, openInterest: 100 }),   // 0.1
      makeContract({ symbol: 'B', volume: 200, openInterest: 100 }),  // 2.0
      makeContract({ symbol: 'C', volume: 50, openInterest: 100 }),   // 0.5
      makeContract({ symbol: 'D', volume: 30, openInterest: 100 }),   // 0.3
    ]
    const result = computeTopVolOiContracts(contracts, 3)
    expect(result.map(r => r.symbol)).toEqual(['B', 'C', 'D'])
  })

  it('uses 1 as minimum OI to avoid division by zero', () => {
    const contracts = [makeContract({ volume: 500, openInterest: 0 })]
    const result = computeTopVolOiContracts(contracts)
    expect(result[0].volOiRatio).toBe(500)
  })
})

describe('computeIvSkew', () => {
  it('returns avg OTM call IV minus avg OTM put IV', () => {
    const contracts = [
      makeContract({ optionType: 'call', strike: 160, impliedVolatility: 0.4, underlyingPrice: 150 }),
      makeContract({ optionType: 'put', strike: 140, impliedVolatility: 0.3, underlyingPrice: 150 }),
    ]
    expect(computeIvSkew(contracts, 150)).toBeCloseTo(0.1)
  })

  it('returns null when no OTM options within range', () => {
    const contracts = [makeContract({ optionType: 'call', strike: 300, underlyingPrice: 150 })]
    expect(computeIvSkew(contracts, 150)).toBeNull()
  })
})

describe('computeUnusualnesScore', () => {
  it('sums volOI, put/call deviation, and IV change contributions', () => {
    const signals: SignalData = {
      putCallRatio: 0.7,  // deviation = 0, contributes 0
      topVolOiContracts: [{ symbol: 'A', strike: 150, optionType: 'call', volOiRatio: 2.0 }],
      ivSkew: null,
      ivChange: { A: 0.1 },  // 0.1 * 5 = 0.5
    }
    // 2.0 + 0 + 0.5 = 2.5
    expect(computeUnusualnesScore(signals)).toBeCloseTo(2.5)
  })

  it('skips IV change contribution when no prior-day data', () => {
    const signals: SignalData = {
      putCallRatio: 1.2,  // |1.2 - 0.7| * 2 = 1.0
      topVolOiContracts: [{ symbol: 'A', strike: 150, optionType: 'call', volOiRatio: 1.0 }],
      ivSkew: null,
    }
    expect(computeUnusualnesScore(signals)).toBeCloseTo(2.0)
  })
})

describe('computeSignals day-2 fields', () => {
  it('computes volume, OI, and IV changes vs previous day', () => {
    const prev = [makeContract({ symbol: 'X', volume: 100, openInterest: 500, impliedVolatility: 0.3 })]
    const curr = [makeContract({ symbol: 'X', volume: 150, openInterest: 600, impliedVolatility: 0.35 })]
    const signals = computeSignals(curr, 148, prev)
    expect(signals.volumeChange?.['X']).toBeCloseTo(0.5)
    expect(signals.oiChange?.['X']).toBeCloseTo(0.2)
    expect(signals.ivChange?.['X']).toBeCloseTo(0.05)
  })

  it('omits day-2 fields when no previous data is supplied', () => {
    const curr = [makeContract()]
    const signals = computeSignals(curr, 148)
    expect(signals.volumeChange).toBeUndefined()
    expect(signals.oiChange).toBeUndefined()
    expect(signals.ivChange).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest __tests__/signals.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/signals'`

- [ ] **Step 3: Implement `lib/signals.ts`**

```typescript
// lib/signals.ts
import { ContractData, SignalData } from '@/types/market'

export function computePutCallRatio(contracts: ContractData[]): number | null {
  const callVol = contracts
    .filter(c => c.optionType === 'call')
    .reduce((sum, c) => sum + (c.volume ?? 0), 0)
  const putVol = contracts
    .filter(c => c.optionType === 'put')
    .reduce((sum, c) => sum + (c.volume ?? 0), 0)
  if (callVol === 0) return null
  return putVol / callVol
}

export function computeTopVolOiContracts(
  contracts: ContractData[],
  topN = 3
): SignalData['topVolOiContracts'] {
  return contracts
    .map(c => ({
      symbol: c.symbol,
      strike: c.strike,
      optionType: c.optionType,
      volOiRatio: (c.volume ?? 0) / Math.max(c.openInterest ?? 0, 1),
    }))
    .sort((a, b) => b.volOiRatio - a.volOiRatio)
    .slice(0, topN)
}

export function computeIvSkew(
  contracts: ContractData[],
  underlyingPrice: number,
  rangePercent = 0.1
): number | null {
  const lo = underlyingPrice * (1 - rangePercent)
  const hi = underlyingPrice * (1 + rangePercent)

  const otmCalls = contracts.filter(
    c =>
      c.optionType === 'call' &&
      c.strike > underlyingPrice &&
      c.strike <= hi &&
      c.impliedVolatility != null
  )
  const otmPuts = contracts.filter(
    c =>
      c.optionType === 'put' &&
      c.strike < underlyingPrice &&
      c.strike >= lo &&
      c.impliedVolatility != null
  )

  if (!otmCalls.length || !otmPuts.length) return null

  const avg = (arr: ContractData[]) =>
    arr.reduce((s, c) => s + c.impliedVolatility!, 0) / arr.length

  return avg(otmCalls) - avg(otmPuts)
}

export function computeUnusualnesScore(signals: SignalData): number {
  const maxVolOi = signals.topVolOiContracts[0]?.volOiRatio ?? 0
  const pcAdj = signals.putCallRatio != null ? Math.abs(signals.putCallRatio - 0.7) * 2 : 0
  const ivChangeMax = signals.ivChange
    ? Math.max(...Object.values(signals.ivChange).map(Math.abs))
    : 0
  return maxVolOi + pcAdj + ivChangeMax * 5
}

export function computeSignals(
  contracts: ContractData[],
  underlyingPrice: number,
  previousContracts?: ContractData[]
): SignalData {
  const signals: SignalData = {
    putCallRatio: computePutCallRatio(contracts),
    topVolOiContracts: computeTopVolOiContracts(contracts),
    ivSkew: computeIvSkew(contracts, underlyingPrice),
  }

  if (previousContracts?.length) {
    const prevMap = new Map(previousContracts.map(c => [c.symbol, c]))
    const volumeChange: Record<string, number> = {}
    const oiChange: Record<string, number> = {}
    const ivChange: Record<string, number> = {}

    for (const c of contracts) {
      const prev = prevMap.get(c.symbol)
      if (!prev) continue
      if (prev.volume && c.volume) {
        volumeChange[c.symbol] = (c.volume - prev.volume) / prev.volume
      }
      if (prev.openInterest && c.openInterest) {
        oiChange[c.symbol] = (c.openInterest - prev.openInterest) / prev.openInterest
      }
      if (prev.impliedVolatility != null && c.impliedVolatility != null) {
        ivChange[c.symbol] = c.impliedVolatility - prev.impliedVolatility
      }
    }

    if (Object.keys(volumeChange).length) signals.volumeChange = volumeChange
    if (Object.keys(oiChange).length) signals.oiChange = oiChange
    if (Object.keys(ivChange).length) signals.ivChange = ivChange
  }

  return signals
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npx jest __tests__/signals.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/signals.ts __tests__/signals.test.ts
git commit -m "feat: add signal computation with full unit test coverage"
```

---

## Task 5: Market data wrapper (`lib/marketData.ts`)

**Files:**
- Create: `lib/marketData.ts`

- [ ] **Step 1: Create `lib/marketData.ts`**

This is the TradeStation swap point. Nothing outside this file should import from `yahoo-finance2`.

```typescript
// lib/marketData.ts
import yahooFinance from 'yahoo-finance2'
import type { OptionChainData, ContractData } from '@/types/market'

yahooFinance.suppressNotices(['yahooSurvey'])

const MAX_EXPIRATIONS = 3

export async function getOptionChain(ticker: string): Promise<OptionChainData> {
  const quote = await yahooFinance.quote(ticker)
  const underlyingPrice = quote.regularMarketPrice ?? 0

  const optionMeta = await yahooFinance.options(ticker)
  const expirations = optionMeta.expirationDates.slice(0, MAX_EXPIRATIONS)

  const allContracts: ContractData[] = []

  for (const expDate of expirations) {
    const chain = await yahooFinance.options(ticker, { date: expDate })
    const optionSet = chain.options[0]
    if (!optionSet) continue

    const toContract = (
      c: { contractSymbol: string; strike: number; volume?: number; openInterest?: number; impliedVolatility?: number; lastPrice?: number },
      optionType: 'call' | 'put'
    ): ContractData => ({
      symbol: c.contractSymbol,
      expiration: new Date(expDate),
      strike: c.strike,
      optionType,
      volume: c.volume ?? null,
      openInterest: c.openInterest ?? null,
      impliedVolatility: c.impliedVolatility ?? null,
      lastPrice: c.lastPrice ?? null,
      underlyingPrice,
    })

    allContracts.push(
      ...optionSet.calls.map(c => toContract(c, 'call')),
      ...optionSet.puts.map(p => toContract(p, 'put'))
    )
  }

  return { ticker, underlyingPrice, contracts: allContracts }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/marketData.ts
git commit -m "feat: add getOptionChain() wrapper around yahoo-finance2"
```

---

## Task 6: Model-agnostic AI client (`lib/ai.ts`)

**Files:**
- Create: `lib/ai.ts`

The provider and model are fully controlled by env vars: `AI_PROVIDER` (anthropic | openai | google) and `AI_MODEL` (any model ID valid for that provider). API keys are read automatically by each provider SDK from their standard env var names (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`).

- [ ] **Step 1: Create `lib/ai.ts`**

```typescript
// lib/ai.ts
import { generateText, LanguageModelV1 } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import type { SignalData } from '@/types/market'

const SYSTEM_PROMPT = `You are a market analyst writing short, neutral, educational summaries of options activity for retail traders. Describe observed activity factually based only on the data provided. Never give buy/sell recommendations, price targets, or predictions. Keep the response to 2-3 sentences, plain English, no jargon without brief explanation.`

function getModel(): LanguageModelV1 {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  const modelId = process.env.AI_MODEL ?? 'claude-sonnet-4-6'

  switch (provider) {
    case 'openai':
      return openai(modelId)
    case 'google':
      return google(modelId)
    case 'anthropic':
    default:
      return anthropic(modelId)
  }
}

export async function generateNarrative(ticker: string, signals: SignalData): Promise<string> {
  const { text } = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt: `Ticker: ${ticker}\n\nOptions activity signals:\n${JSON.stringify(signals, null, 2)}\n\nWrite a 2-3 sentence plain-English summary.`,
    maxTokens: 300,
  })
  return text.trim()
}
```

- [ ] **Step 2: Update `CLAUDE.md` to document AI env vars**

In `CLAUDE.md`, update the Environment Variables section to replace `ANTHROPIC_API_KEY=` alone with:

```
# AI — set AI_PROVIDER + AI_MODEL to swap provider/model without code changes
AI_PROVIDER=anthropic         # anthropic | openai | google
AI_MODEL=claude-sonnet-4-6    # any model ID valid for the chosen provider
ANTHROPIC_API_KEY=            # required if AI_PROVIDER=anthropic
OPENAI_API_KEY=               # required if AI_PROVIDER=openai
GOOGLE_GENERATIVE_AI_API_KEY= # required if AI_PROVIDER=google
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai.ts CLAUDE.md
git commit -m "feat: add model-agnostic AI client via Vercel AI SDK"
```

---

## Task 7: Daily pipeline — TDD

**Files:**
- Create: `lib/pipeline.ts`
- Create: `__tests__/pipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/pipeline.test.ts`:

```typescript
import { runDailyPipeline } from '@/lib/pipeline'

// Mock all external dependencies
jest.mock('@/lib/marketData', () => ({
  getOptionChain: jest.fn(),
}))
jest.mock('@/lib/ai', () => ({
  generateNarrative: jest.fn().mockResolvedValue('Test narrative.'),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

import { getOptionChain } from '@/lib/marketData'
import { createAdminClient } from '@/lib/supabase/admin'

const mockGetOptionChain = getOptionChain as jest.Mock
const mockCreateAdminClient = createAdminClient as jest.Mock

const mockChain = {
  ticker: 'AAPL',
  underlyingPrice: 180,
  contracts: [
    {
      symbol: 'AAPL240119C00180000',
      expiration: new Date('2024-01-19'),
      strike: 180,
      optionType: 'call',
      volume: 500,
      openInterest: 2000,
      impliedVolatility: 0.35,
      lastPrice: 4,
      underlyingPrice: 180,
    },
    {
      symbol: 'AAPL240119P00180000',
      expiration: new Date('2024-01-19'),
      strike: 180,
      optionType: 'put',
      volume: 300,
      openInterest: 1500,
      impliedVolatility: 0.4,
      lastPrice: 5,
      underlyingPrice: 180,
    },
  ],
}

function makeMockSupabase({
  watchlistTickers = [] as string[],
  prevSnapshots = [] as unknown[],
} = {}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null })
  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table === 'watchlist_items') {
      return {
        select: jest.fn().mockResolvedValue({ data: watchlistTickers.map(t => ({ ticker: t })), error: null }),
      }
    }
    if (table === 'option_snapshots') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: prevSnapshots, error: null }),
        upsert: upsertMock,
      }
    }
    return { upsert: upsertMock, select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
  })
  return { from: fromMock, upsertMock }
}

describe('runDailyPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('processes fixed universe tickers and returns results', async () => {
    const { from } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.processed.length).toBeGreaterThan(0)
    expect(result.failed).toHaveLength(0)
  })

  it('includes watchlist tickers not in fixed universe', async () => {
    const { from } = makeMockSupabase({ watchlistTickers: ['GME'] })
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue({ ...mockChain, ticker: 'GME' })

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.processed).toContain('GME')
  })

  it('skips failed tickers gracefully without aborting the job', async () => {
    const { from } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.failed.length).toBeGreaterThan(0)
    expect(result.processed.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest __tests__/pipeline.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/pipeline'`

- [ ] **Step 3: Implement `lib/pipeline.ts`**

```typescript
// lib/pipeline.ts
import { getOptionChain } from '@/lib/marketData'
import { computeSignals, computeUnusualnesScore } from '@/lib/signals'
import { generateNarrative } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { FIXED_UNIVERSE } from '@/constants/tickers'
import type { ContractData } from '@/types/market'

const DELAY_MS = 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runDailyPipeline(
  date: Date
): Promise<{ processed: string[]; failed: string[] }> {
  const supabase = createAdminClient()
  const dateStr = date.toISOString().split('T')[0]

  // Build full ticker list
  const { data: watchlistItems } = await supabase.from('watchlist_items').select('ticker')
  const watchlistTickers = [...new Set((watchlistItems ?? []).map((w: { ticker: string }) => w.ticker))]
  const tickers = [...new Set([...FIXED_UNIVERSE, ...watchlistTickers])]

  // Load yesterday's snapshots for day-2 signals
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: prevSnapshots } = await supabase
    .from('option_snapshots')
    .select('*')
    .eq('snapshot_date', yesterdayStr)

  const processed: string[] = []
  const failed: string[] = []

  for (const ticker of tickers) {
    try {
      const chain = await getOptionChain(ticker)

      // Store snapshots
      const rows = chain.contracts.map(c => ({
        snapshot_date: dateStr,
        ticker,
        contract_symbol: c.symbol,
        expiration: c.expiration.toISOString().split('T')[0],
        strike: c.strike,
        option_type: c.optionType,
        volume: c.volume,
        open_interest: c.openInterest,
        implied_volatility: c.impliedVolatility,
        last_price: c.lastPrice,
      }))

      await supabase
        .from('option_snapshots')
        .upsert(rows, { onConflict: 'snapshot_date,contract_symbol' })

      // Map prior-day DB rows back to ContractData shape
      const tickerPrev: ContractData[] = (prevSnapshots ?? [])
        .filter((s: { ticker: string }) => s.ticker === ticker)
        .map((s: {
          contract_symbol: string; expiration: string; strike: string | number;
          option_type: string; volume: number | null; open_interest: number | null;
          implied_volatility: string | number | null; last_price: string | number | null
        }) => ({
          symbol: s.contract_symbol,
          expiration: new Date(s.expiration),
          strike: Number(s.strike),
          optionType: s.option_type as 'call' | 'put',
          volume: s.volume,
          openInterest: s.open_interest,
          impliedVolatility: s.implied_volatility != null ? Number(s.implied_volatility) : null,
          lastPrice: s.last_price != null ? Number(s.last_price) : null,
          underlyingPrice: chain.underlyingPrice,
        }))

      const signals = computeSignals(
        chain.contracts,
        chain.underlyingPrice,
        tickerPrev.length ? tickerPrev : undefined
      )

      const unusualnessScore = computeUnusualnesScore(signals)
      const narrative = await generateNarrative(ticker, signals)

      await supabase.from('digests').upsert(
        { digest_date: dateStr, ticker, unusualness_score: unusualnessScore, signals, narrative },
        { onConflict: 'digest_date,ticker' }
      )

      processed.push(ticker)
    } catch (err) {
      console.error(`[pipeline] failed ${ticker}:`, err)
      failed.push(ticker)
    }

    await sleep(DELAY_MS)
  }

  return { processed, failed }
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npx jest __tests__/pipeline.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline.ts __tests__/pipeline.test.ts
git commit -m "feat: add daily pipeline with full unit test coverage"
```

---

## Task 8: Cron API route

**Files:**
- Create: `app/api/cron/daily-digest/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron route**

```typescript
// app/api/cron/daily-digest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDailyPipeline } from '@/lib/pipeline'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = new Date()
  const result = await runDailyPipeline(date)

  return NextResponse.json({
    ok: true,
    date: date.toISOString().split('T')[0],
    ...result,
  })
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-digest",
      "schedule": "0 21 * * 1-5"
    }
  ]
}
```

Note: Vercel Cron sends a `GET` request. The route above uses `POST` for manual testing. For Vercel Cron compatibility, also export a `GET` handler that delegates to the same logic:

```typescript
// Update app/api/cron/daily-digest/route.ts — add:
export async function GET(req: NextRequest) {
  return POST(req)
}
```

- [ ] **Step 3: Verify cron route locally**

```bash
npm run dev &
curl -X POST http://localhost:3000/api/cron/daily-digest \
  -H "x-cron-secret: test-secret"
```
Expected: `{"ok":true,...}` (or an error from yahoo-finance2 if not populated yet — that's fine, the handler should respond 200 with failed tickers listed).

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/ vercel.json
git commit -m "feat: add protected cron endpoint and Vercel cron schedule"
```

---

## Task 9: Auth — middleware, login page, and profile creation

**Files:**
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = { matcher: ['/dashboard/:path*'] }
```

- [ ] **Step 2: Create `app/auth/callback/route.ts`**

```typescript
// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
```

- [ ] **Step 3: Create `app/login/page.tsx`**

```tsx
// app/login/page.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-center">Check your email for a sign-in link.</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Sign in to OptionPulse</h1>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Send magic link
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Ensure profile row is created on first dashboard load**

This will be handled in Task 11 (dashboard page). The pattern: on server component load, check if `profiles` row exists for `user.id`; if not, insert it. No trigger needed.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts app/login/ app/auth/
git commit -m "feat: add magic-link auth, middleware, and auth callback"
```

---

## Task 10: Legal disclaimer component and root layout

**Files:**
- Create: `components/Disclaimer.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/Disclaimer.tsx`**

```tsx
// components/Disclaimer.tsx
export function Disclaimer() {
  return (
    <p className="text-xs text-gray-500 leading-relaxed">
      OptionPulse summarizes publicly observable options market activity for
      informational and educational purposes only. Nothing here is investment
      advice or a recommendation to buy or sell any security.
    </p>
  )
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Disclaimer } from '@/components/Disclaimer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OptionPulse',
  description: 'Daily AI-generated options activity digest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <footer className="border-t mt-16 py-8 px-4 max-w-4xl mx-auto">
          <Disclaimer />
        </footer>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ app/layout.tsx
git commit -m "feat: add disclaimer component and root layout"
```

---

## Task 11: Public pages — landing + movers

**Files:**
- Create: `app/page.tsx`
- Create: `app/movers/page.tsx`

- [ ] **Step 1: Create `app/movers/page.tsx` (full public list)**

```tsx
// app/movers/page.tsx
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export const revalidate = 3600  // revalidate every hour

export default async function MoversPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: digests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Today&apos;s Top Movers</h1>
      <p className="text-gray-500 mb-8">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {!digests?.length && (
        <p className="text-gray-500">Today&apos;s digest hasn&apos;t run yet. Check back after 4pm ET.</p>
      )}

      <div className="flex flex-col gap-6">
        {digests?.map(d => (
          <div key={d.ticker} className="border rounded-lg p-5">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-bold text-xl">{d.ticker}</span>
              <span className="text-sm text-gray-400">
                score: {d.unusualness_score?.toFixed(2)}
              </span>
            </div>
            <p className="text-gray-700 leading-relaxed">{d.narrative}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 pt-6 border-t">
        <Disclaimer />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create `app/page.tsx` (landing — top 3 teaser)**

```tsx
// app/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export const revalidate = 3600

export default async function LandingPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: topDigests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })
    .limit(3)

  return (
    <main className="max-w-4xl mx-auto px-4 py-20">
      <h1 className="text-5xl font-bold mb-4">OptionPulse</h1>
      <p className="text-xl text-gray-600 mb-12">
        Daily AI-written summaries of unusual options activity — no data dumps, just plain English.
      </p>

      {topDigests?.length ? (
        <>
          <h2 className="text-lg font-semibold mb-4 text-gray-500 uppercase tracking-wide">
            Today&apos;s top signals
          </h2>
          <div className="flex flex-col gap-4 mb-10">
            {topDigests.map(d => (
              <div key={d.ticker} className="border rounded-lg p-4">
                <span className="font-bold">{d.ticker}</span>
                <p className="text-gray-600 mt-1 text-sm">{d.narrative}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-gray-500 mb-10">Today&apos;s digest runs after 4pm ET. Come back later.</p>
      )}

      <div className="flex gap-4">
        <Link
          href="/movers"
          className="bg-black text-white px-6 py-3 rounded-lg font-medium"
        >
          View all movers
        </Link>
        <Link
          href="/login"
          className="border px-6 py-3 rounded-lg font-medium"
        >
          Track your tickers →
        </Link>
      </div>

      <div className="mt-16">
        <Disclaimer />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/movers/
git commit -m "feat: add public landing page and movers feed"
```

---

## Task 12: Dashboard shell + profile creation

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create `app/dashboard/page.tsx`**

Profile creation on first load, then show today's watchlist digests.

```tsx
// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ensure profile row exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.from('profiles').insert({ id: user.id, email: user.email })
  }

  const subscriptionStatus = profile?.subscription_status ?? 'free'
  const today = new Date().toISOString().split('T')[0]

  // Load user's watchlist tickers
  const { data: watchlistItems } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .order('created_at', { ascending: true })

  const tickers = (watchlistItems ?? []).map(w => w.ticker)

  // Load today's digests for those tickers
  const { data: digests } = tickers.length
    ? await supabase
        .from('digests')
        .select('ticker, narrative, unusualness_score')
        .eq('digest_date', today)
        .in('ticker', tickers)
    : { data: [] }

  const digestMap = new Map((digests ?? []).map(d => [d.ticker, d]))

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">My Dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/watchlist" className="text-blue-600">Manage watchlist</Link>
          <Link href="/account" className="text-gray-500">Account</Link>
        </div>
      </div>

      {tickers.length === 0 && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">Your watchlist is empty.</p>
          <Link href="/dashboard/watchlist" className="text-blue-600">Add a ticker →</Link>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {tickers.map(ticker => {
          const digest = digestMap.get(ticker)
          return (
            <div key={ticker} className="border rounded-lg p-5">
              <span className="font-bold text-xl">{ticker}</span>
              {digest ? (
                <p className="text-gray-700 mt-2 leading-relaxed">{digest.narrative}</p>
              ) : (
                <p className="text-gray-400 mt-2 text-sm">
                  Digest not yet available. Check back after 4pm ET.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {subscriptionStatus === 'free' && tickers.length > 0 && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium">Want to track more tickers?</p>
          <Link href="/pricing" className="text-blue-600">Upgrade to Pro →</Link>
        </div>
      )}

      <div className="mt-10 pt-6 border-t">
        <Disclaimer />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add dashboard with profile creation and watchlist digests"
```

---

## Task 13: Watchlist management page

**Files:**
- Create: `app/dashboard/watchlist/page.tsx`

- [ ] **Step 1: Create `app/dashboard/watchlist/page.tsx`**

Free tier: max 1 ticker. Paid: unlimited. Enforce in app logic.

```tsx
// app/dashboard/watchlist/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type WatchlistItem = { id: string; ticker: string }
type Profile = { subscription_status: string }

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newTicker, setNewTicker] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profileData }, { data: watchlistData }] = await Promise.all([
        supabase.from('profiles').select('subscription_status').eq('id', user.id).single(),
        supabase.from('watchlist_items').select('id, ticker').order('created_at'),
      ])

      setProfile(profileData)
      setItems(watchlistData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const isPaid = profile?.subscription_status === 'active'
  const atLimit = !isPaid && items.length >= 1

  async function addTicker(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return

    if (atLimit) {
      setError('Free accounts are limited to 1 ticker. Upgrade to Pro to add more.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: insertError } = await supabase
      .from('watchlist_items')
      .insert({ user_id: user.id, ticker })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setItems(prev => [...prev, data])
      setNewTicker('')
    }
  }

  async function removeTicker(id: string) {
    await supabase.from('watchlist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return <main className="max-w-4xl mx-auto px-4 py-12">Loading...</main>

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">My Watchlist</h1>

      <form onSubmit={addTicker} className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="Ticker (e.g. AAPL)"
          value={newTicker}
          onChange={e => setNewTicker(e.target.value)}
          disabled={atLimit}
          className="border rounded px-3 py-2 flex-1 uppercase"
        />
        <button
          type="submit"
          disabled={atLimit}
          className="bg-black text-white rounded px-5 py-2 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {atLimit && (
        <p className="text-amber-700 text-sm mb-4 bg-amber-50 p-3 rounded">
          Free accounts track 1 ticker. <a href="/pricing" className="underline">Upgrade to Pro</a> for unlimited.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map(item => (
          <li key={item.id} className="flex items-center justify-between border rounded px-4 py-3">
            <span className="font-mono font-semibold">{item.ticker}</span>
            <button
              onClick={() => removeTicker(item.id)}
              className="text-red-500 text-sm hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/watchlist/
git commit -m "feat: add watchlist management with free-tier enforcement"
```

---

## Task 14: Stripe integration

**Files:**
- Create: `lib/stripe.ts`
- Create: `app/pricing/page.tsx`
- Create: `app/account/page.tsx`
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `app/api/stripe/portal/route.ts`

- [ ] **Step 1: Create `lib/stripe.ts`**

```typescript
// lib/stripe.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})
```

- [ ] **Step 2: Create `app/pricing/page.tsx`**

```tsx
// app/pricing/page.tsx
export default function PricingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="text-4xl font-bold mb-4">Simple pricing</h1>
      <p className="text-gray-600 mb-12">One plan, no tiers to compare.</p>

      <div className="border rounded-2xl p-10 max-w-sm mx-auto">
        <div className="text-5xl font-bold mb-2">$9<span className="text-xl text-gray-500">/mo</span></div>
        <p className="text-gray-500 mb-8">OptionPulse Pro</p>
        <ul className="text-left space-y-3 mb-10 text-sm">
          {[
            'Unlimited watchlist tickers',
            'Daily AI digest for all your tickers',
            'Full digest history archive',
            'Today\'s Top Movers (always free)',
          ].map(f => (
            <li key={f} className="flex gap-2">
              <span>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <form action="/api/stripe/checkout" method="POST">
          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-lg font-medium"
          >
            Subscribe for $9/mo
          </button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create `app/api/stripe/checkout/route.ts`**

```typescript
// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    customer_email: user.email,
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing`,
    metadata: { user_id: user.id },
  })

  return NextResponse.redirect(session.url!, { status: 303 })
}
```

- [ ] **Step 4: Create `app/api/stripe/webhook/route.ts`**

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: 'active',
        })
        .eq('email', session.customer_email!)
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const status = sub.status === 'active' ? 'active' : sub.status
      await supabase
        .from('profiles')
        .update({ subscription_status: status })
        .eq('stripe_subscription_id', sub.id)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase
        .from('profiles')
        .update({ subscription_status: 'free' })
        .eq('stripe_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create `app/api/stripe/portal/route.ts`**

```typescript
// app/api/stripe/portal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/account`,
  })

  return NextResponse.redirect(portalSession.url, { status: 303 })
}
```

- [ ] **Step 6: Create `app/account/page.tsx`**

```tsx
// app/account/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATUS_LABELS: Record<string, string> = {
  free: 'Free',
  active: 'Pro (active)',
  canceled: 'Pro (canceled)',
  past_due: 'Pro (past due)',
}

export default async function AccountPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, stripe_customer_id')
    .eq('id', user.id)
    .single()

  const status = profile?.subscription_status ?? 'free'
  const isPaid = status === 'active'

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">Account</h1>

      <div className="border rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-500">Email</p>
        <p className="font-medium">{user.email}</p>
      </div>

      <div className="border rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-500">Plan</p>
        <p className="font-medium">{STATUS_LABELS[status] ?? status}</p>
      </div>

      {isPaid ? (
        <form action="/api/stripe/portal" method="POST">
          <button type="submit" className="border px-5 py-2 rounded-lg text-sm">
            Manage subscription →
          </button>
        </form>
      ) : (
        <a href="/pricing" className="text-blue-600 text-sm">Upgrade to Pro →</a>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/stripe.ts app/pricing/ app/account/ app/api/stripe/
git commit -m "feat: add Stripe checkout, webhook, portal, pricing, and account pages"
```

---

## Task 15: Digest history archive (paid gate)

**Files:**
- Create: `app/dashboard/history/page.tsx`

- [ ] **Step 1: Create `app/dashboard/history/page.tsx`**

```tsx
// app/dashboard/history/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { ticker?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const isPaid = profile?.subscription_status === 'active'

  if (!isPaid) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-4">Digest History</h1>
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            Digest history is available on the Pro plan.
          </p>
          <Link href="/pricing" className="bg-black text-white px-5 py-2 rounded-lg text-sm">
            Upgrade to Pro →
          </Link>
        </div>
      </main>
    )
  }

  // Get user's watchlist tickers for the filter
  const { data: watchlistItems } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .order('created_at')

  const tickers = (watchlistItems ?? []).map(w => w.ticker)
  const selectedTicker = searchParams.ticker ?? tickers[0]

  const { data: digests } = selectedTicker
    ? await supabase
        .from('digests')
        .select('digest_date, narrative, unusualness_score')
        .eq('ticker', selectedTicker)
        .order('digest_date', { ascending: false })
        .limit(30)
    : { data: [] }

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Digest History</h1>

      <div className="flex gap-2 mb-8 flex-wrap">
        {tickers.map(t => (
          <Link
            key={t}
            href={`/dashboard/history?ticker=${t}`}
            className={`px-3 py-1 rounded-full text-sm border ${
              t === selectedTicker ? 'bg-black text-white border-black' : ''
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {(digests ?? []).map(d => (
          <div key={d.digest_date} className="border rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-1">
              {new Date(d.digest_date).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </p>
            <p className="text-gray-700 leading-relaxed">{d.narrative}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 pt-6 border-t">
        <Disclaimer />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/history/
git commit -m "feat: add digest history page with paid-tier gate"
```

---

## Task 16: Run all tests + deploy

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All tests PASS with no errors.

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --prod
```

Set all environment variables in the Vercel dashboard (Settings → Environment Variables) matching `.env.local`. Also add:
- `STRIPE_WEBHOOK_SECRET`: obtained from `stripe listen --forward-to ...` locally or from the Stripe dashboard webhook endpoint.

- [ ] **Step 4: Register Stripe webhook in Stripe dashboard**

URL: `https://your-vercel-domain.vercel.app/api/stripe/webhook`
Events to listen for:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

- [ ] **Step 5: Trigger a manual cron run to seed data**

```bash
curl -X POST https://your-vercel-domain.vercel.app/api/cron/daily-digest \
  -H "x-cron-secret: <your CRON_SECRET>"
```

- [ ] **Step 6: Verify `/movers` shows data**

Open `https://your-vercel-domain.vercel.app/movers` — should show ranked digests with narratives.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: final wiring and deployment prep"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Public "Today's Top Movers" — Task 11 (`/movers`)
- ✅ Magic-link auth — Task 9
- ✅ Free account with 1-ticker watchlist + enforcement — Task 13
- ✅ Paid tier via Stripe ($9/mo) — Task 14
- ✅ Unlimited watchlist for paid — Task 13 (`atLimit` check)
- ✅ History archive (paid only) — Task 15
- ✅ Daily cron pipeline — Tasks 7 + 8
- ✅ Yahoo data → snapshots → signals → Claude narrative → digests — Task 7 (`lib/pipeline.ts`)
- ✅ `lib/marketData.ts` as the TradeStation swap point — Task 5
- ✅ Model-agnostic AI with env-var provider/model — Task 6
- ✅ RLS policies — Task 2
- ✅ Legal disclaimer — Task 10 (component + footer) + in `/movers` and `/dashboard`
- ✅ `vercel.json` cron schedule — Task 8
- ✅ Stripe webhook lifecycle (active/canceled/past_due) — Task 14
- ✅ Customer Portal (no custom billing UI) — Task 14

**Out of scope confirmed not built:** real-time updates, email alerts, TradeStation API, mobile app, multiple watchlists, backtesting.
