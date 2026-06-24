# GEX Analysis Tool — Design Spec
_Date: 2026-06-24_

## 1. Overview

Transform OptionPulse from an AI-generated options digest into a professional-grade Gamma Exposure (GEX) analysis tool. GEX measures aggregate net gamma held by options market makers, quantifying dealer hedging flows and identifying structural price levels (Zero Gamma, Call Wall, Put Wall).

Target audience: active retail options traders familiar with gamma/vol concepts.

---

## 2. Design Read & Dials

**Read:** professional-grade fintech data terminal for options traders, precision-first, data-dense, dark.

- DESIGN_VARIANCE: 6
- MOTION_INTENSITY: 3
- VISUAL_DENSITY: 7

---

## 3. Palette — "Obsidian + Cyan"

Replace existing navy/amber with true zinc-950 base and cyan accent.

```css
--bg:         #09090B;  /* zinc-950, no color cast */
--surface:    #111113;  /* zinc-900 tinted */
--surface-2:  #18181B;  /* zinc-900 */
--surface-3:  #1F1F23;  /* zinc-800 */
--border:     #27272A;  /* zinc-800 */
--border-2:   #3F3F46;  /* zinc-700 */
--text-1:     #FAFAFA;  /* zinc-50 */
--text-2:     #A1A1AA;  /* zinc-400 */
--text-3:     #52525B;  /* zinc-600 */
--cyan:       #22D3EE;  /* cyan-400 — main accent */
--cyan-glow:  rgba(34,211,238,0.15);
--cyan-dim:   rgba(34,211,238,0.07);
--green:      #10D9A0;  /* positive gamma */
--green-dim:  rgba(16,217,160,0.07);
--red:        #F0556A;  /* negative gamma */
--red-dim:    rgba(240,85,106,0.07);
```

Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (all numeric data).

---

## 4. GEX Computation Engine (`lib/gex.ts`)

### 4.1 Black-Scholes Gamma

Yahoo Finance provides `impliedVolatility`. Gamma is computed in-house, no dependency needed.

```
d1   = [ln(S/K) + (r + σ²/2)·T] / (σ·√T)
Γ    = φ(d1) / (S · σ · √T)       // φ = standard normal PDF
```

Parameters:
- S = current underlying price
- K = strike price
- T = time to expiration in years (calendar days / 365)
- r = 0.05 (US 3-month T-bill rate, hardcoded, environment-overridable)
- σ = implied volatility from Yahoo Finance (annualized)

Contracts where T ≤ 0 or σ ≤ 0 are skipped.

### 4.2 Strike-Level GEX

```
GEX_call(K) = Γ_call · OI_call · 100 · S²   (positive)
GEX_put(K)  = Γ_put  · OI_put  · 100 · S²   (negative, × -1)
GEX_net(K)  = GEX_call(K) + GEX_put(K)
```

Dollar-denominated (divide by 1e9 for billions display).

### 4.3 Aggregate GEX

```
Net GEX    = Σ GEX_net(K) across all strikes & expirations
Abs GEX    = Σ |GEX_call(K)| + Σ |GEX_put(K)|
Regime     = 'positive' if Net GEX > 0 else 'negative'
Call Wall  = argmax GEX_call(K)
Put Wall   = argmax |GEX_put(K)|
Zero Gamma = price level where interpolated GEX profile crosses 0
             (simulated by recalculating GEX at spot ± 15% in 0.5% steps)
```

### 4.4 Expirations

Fetch first 6 expirations (up from 3) to better capture 0DTE + weekly + monthly.

---

## 5. Data Types

### 5.1 ContractData (extended)

```ts
interface ContractData {
  symbol: string
  expiration: Date
  strike: number
  optionType: 'call' | 'put'
  volume: number | null
  openInterest: number | null
  impliedVolatility: number | null
  lastPrice: number | null
  underlyingPrice: number
  gamma?: number   // NEW: computed via Black-Scholes
}
```

### 5.2 GexData (new)

```ts
interface GexData {
  ticker: string
  underlyingPrice: number
  netGex: number           // dollar value
  absGex: number
  regime: 'positive' | 'negative'
  callWall: number | null  // strike
  putWall: number | null   // strike
  zeroGamma: number | null // price level
  byStrike: GexByStrike[]
  putCallRatio: number | null
  ivSkew: number | null
}

interface GexByStrike {
  strike: number
  callGex: number   // positive
  putGex: number    // negative
  netGex: number
}
```

---

## 6. Database Schema Changes

### Drop
- `digests` table (AI narratives no longer generated)

### New table: `gex_snapshots`

```sql
create table gex_snapshots (
  id               uuid default gen_random_uuid() primary key,
  snapshot_date    date not null,
  ticker           text not null,
  underlying_price numeric not null,
  net_gex          numeric,        -- dollar value
  abs_gex          numeric,
  zero_gamma       numeric,        -- price level
  call_wall        numeric,        -- strike
  put_wall         numeric,        -- strike
  regime           text,           -- 'positive' | 'negative'
  gex_by_strike    jsonb,          -- GexByStrike[]
  put_call_ratio   numeric,
  iv_skew          numeric,
  created_at       timestamptz default now(),
  unique (snapshot_date, ticker)
);
```

Keep `option_snapshots` (raw data, unchanged).

---

## 7. Files Changed / Created

| File | Action | Notes |
|---|---|---|
| `types/market.ts` | Update | Add `gamma?` to ContractData, add GexData + GexByStrike |
| `lib/gex.ts` | Create | Black-Scholes gamma + GEX aggregation engine |
| `lib/marketData.ts` | Update | 6 expirations instead of 3 |
| `lib/pipeline.ts` | Update | Use gex.ts, store to gex_snapshots, remove AI call |
| `lib/signals.ts` | Keep | Still compute P/C ratio + IV skew (stored in gex_snapshots) |
| `lib/ai.ts` | Delete | AI narrative generation removed |
| `app/globals.css` | Rewrite | New palette + JetBrains Mono + updated component classes |
| `app/layout.tsx` | Update | Add JetBrains_Mono font |
| `app/page.tsx` | Rewrite | Landing: live SPY regime + GEX explainer |
| `app/movers/page.tsx` | Rewrite | Market overview: all tickers ranked by abs_gex |
| `app/gex/[ticker]/page.tsx` | Create | Full GEX analysis per ticker |
| `app/guide/page.tsx` | Create | Educational guide on reading GEX |
| `app/dashboard/page.tsx` | Update | Watchlist with mini GEX cards |
| `app/dashboard/history/page.tsx` | Update | Show GEX history chart |
| `components/GexChart.tsx` | Create | Recharts diverging bar chart (client component) |
| `components/GexCard.tsx` | Create | Mini GEX summary card (replaces DigestCard) |
| `components/RegimeBadge.tsx` | Create | Positive/Negative gamma pill |
| `components/Nav.tsx` | Update | Updated links |
| `components/DigestCard.tsx` | Delete | Replaced by GexCard |
| `supabase/migrations/0002_gex_schema.sql` | Create | New migration |
| `package.json` | Update | Add recharts, remove ai/ai-sdk packages |

---

## 8. Pages

### 8.1 Landing (`/`)
- Hero: SPY current regime (large positive/negative indicator) + net GEX in $B
- What is GEX? — 2-3 sentence explainer
- Today's key levels for SPY/QQQ (Zero Gamma, Call Wall, Put Wall)
- CTA: "View full analysis" → `/gex/SPY`
- No auth required

### 8.2 GEX Analysis (`/gex/[ticker]`)
- Stat row: Net GEX, Abs GEX, Regime, Underlying price
- Key levels: Call Wall, Put Wall, Zero Gamma (highlighted in chart)
- GEX profile chart (recharts ComposedChart, green bars above / red below, current price + level markers)
- Strike breakdown table (paginated): strike, call GEX, put GEX, net GEX
- Supplementary: P/C ratio, IV skew
- Free: SPY, QQQ, IWM | Paid: all others

### 8.3 Market Overview (`/movers`)
- Grid of all tickers: regime badge, net GEX, call wall, put wall
- Sort options: by abs_gex desc (default), by net_gex, alphabetical
- No auth required (read-only, free data)

### 8.4 Use Guide (`/guide`)
- What is GEX (definition + formula)
- How to read the chart (positive vs negative bars)
- Key levels explained (Zero Gamma, Call Wall, Put Wall)
- Positive vs negative gamma regimes + implications
- Limitations (Yahoo Finance data, single daily update)

### 8.5 Dashboard (`/dashboard`)
- Auth-gated
- Grid of user's watchlist tickers, each as a GexCard
- GexCard: ticker, regime badge, net GEX, call wall, put wall, link to full analysis
- Free: 1 ticker | Paid: unlimited + history link

---

## 9. Paywall

- **Free:** SPY, QQQ, IWM on `/gex/[ticker]`. All tickers visible on `/movers` (summary only). Use guide.
- **Paid ($9/month):** All 18+ tickers on `/gex/[ticker]`, 30-day history, custom watchlist GEX.

---

## 10. What is Removed

- `lib/ai.ts` — deleted
- `@ai-sdk/anthropic`, `@ai-sdk/google`, `ai` npm packages — removed
- `components/DigestCard.tsx` — replaced by GexCard
- `digests` DB table — replaced by `gex_snapshots`
- AI narrative text throughout the UI

---

## 11. Legal Disclaimer

Updated: "OptionPulse computes Gamma Exposure (GEX) from publicly available options data for informational and educational purposes only. GEX is a derived metric, not a forecast. Nothing here is investment advice or a recommendation to buy or sell any security."

---

## 12. Out of Scope

- Real-time/intraday GEX updates (daily cron only)
- 0DTE intraday adjustment model (would require live volume feeds)
- Multi-expiration weighted GEX (computed per expiry but aggregated simply)
- TradeStation API swap (the `lib/marketData.ts` swap point is preserved)
