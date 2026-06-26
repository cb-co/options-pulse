# GEX Analyzer — Phase 4: Historical Context

Implement historical persistence and own-history normalization for the GEX analyzer (Next.js + Recharts, data populated by a once-daily 21:00 UTC EOD cron). This is Phase 4 of the broader improvements plan.

**Why this phase exists:** `Spot²` scaling makes raw GEX magnitudes uncomparable across tickers — "+$17B for SOXL" vs "+$206B for QQQ" means nothing in isolation. The only honest comparison is a ticker against **its own history**. This phase makes "+$17.3B" become "82nd percentile — elevated for SOXL over the last 60 sessions."

## Ground rules

- **Explore before changing.** Confirm the current storage layer and the cron's write path before designing anything.
- **Fix root causes; verify conventions, don't assume them.**
- **Historical comparison only works if methodology is constant** — see the canonical-snapshot rule in Step 2. This is the most important correctness constraint in this phase.
- New UI controls must be keyboard-accessible with correct ARIA. User-facing copy stays educational, never advice.
- Run the build and tests after each step; summarize changes and reasoning before moving on.

---

## Step 1 — Investigate storage (report back before coding)

1. Find where the cron writes today's GEX results and **what backend it uses** (Postgres/SQLite/other DB, or flat JSON/files). Document the existing shape.
2. Determine whether any historical data already exists or whether this is a cold start (almost certainly cold start — EOD OI history generally can't be reconstructed retroactively, so we accumulate forward).
3. Propose the snapshot storage design (schema or file layout) consistent with the existing backend — **do not introduce a new database or dependency** if the cron already persists somewhere usable. Show me the design before implementing.

---

## Step 2 — Snapshot persistence

Persist one record per ticker per trading day with at least:

- `ticker`, `trading_date` (the US session date, not the UTC cron date), `captured_at` (UTC timestamp)
- `net_gex`, `abs_gex`
- `call_wall`, `put_wall`, `zero_gamma`, `spot`
- `pc_ratio`, `iv_skew`
- `methodology` metadata: the expiration count N and profile mode used to compute the snapshot (see canonical rule below)

Requirements:

- **Canonical methodology (critical).** The daily snapshot must be computed with a **fixed, consistent** configuration — default `N = 4 nearest expirations, full profile (not 0DTE-only)** — regardless of whatever expiration/0DTE toggle state a user has set in the UI. History must be apples-to-apples; never persist a snapshot that reflects a transient UI toggle. Record the methodology fields so a future config change is detectable in the data.
- **Idempotent upsert** keyed on `(ticker, trading_date)`. Re-running the cron (or a manual re-trigger) for the same session overwrites, never duplicates.
- **Trading-day awareness.** Map the 21:00 UTC run to the correct US trading date; don't write snapshots for weekends/holidays (no fresh OI). If the source has no new data, skip rather than write a stale duplicate.
- Wire snapshot-writing into the existing cron path; don't create a parallel pipeline.

---

## Step 3 — Own-history normalization

Add a module that, given a ticker's trailing window of snapshots, places today's `net_gex` (and optionally `abs_gex`) in historical context.

- **Primary metric: percentile rank** over a configurable trailing window (default 60 trading sessions, configurable; also support 120). Percentile is the headline number because GEX is skewed and fat-tailed — a percentile rank makes no distributional assumption.
- **Secondary metric: z-score**, but only display it labeled as assuming normality (it doesn't truly hold). Don't lead with it.
- **Cold-start guard.** Define a minimum sample size (e.g., 20 sessions) below which you show "insufficient history" instead of a misleading percentile/z-score. Never compute a percentile from a handful of points and present it as meaningful.
- **Bucket the output** into plain-language bands for the UI: e.g. depressed / below-normal / normal / elevated / extreme, derived from the percentile.
- **Window must use the same methodology.** Only compare snapshots whose `methodology` matches today's canonical config; if the config changed mid-window, exclude the mismatched records (or clearly mark the discontinuity) rather than silently mixing them.

**Tests:** given a fixed synthetic series, assert percentile rank of a known value is correct; assert the cold-start guard triggers under the minimum; assert window selection respects trading-day ordering and the methodology filter. Extend the existing fixture test suite if present.

---

## Step 4 — Per-ticker GEX trend chart

On the ticker page, add a net-GEX-over-time chart (Recharts, matching existing chart styling):

- Net GEX as a line or area over the trailing window, with a zero reference line.
- **Color by regime/sign** — positive (stabilizing) vs negative (amplifying) — consistent with the app's existing green/red convention.
- **Handle gaps correctly** — weekends/holidays have no data; don't interpolate across them in a way that implies continuous sessions. Use the trading-date axis, not calendar days.
- Optional, only if clean: a faint overlay of the percentile band or spot. Keep the primary read uncluttered.
- Accessible: the chart needs a text alternative / summary; interactive elements keyboard-reachable.

---

## Step 5 — UI integration

- Next to the existing Net GEX figure on the ticker page, surface the **percentile read** ("+$17.3B · 82nd pct · elevated · trailing 60 sessions"). Make the window length visible so the number is interpretable.
- During cold start, show the "insufficient history (N of M sessions)" state instead.
- Keep all copy educational/structural.

---

## Acceptance criteria

- Cron writes one canonical snapshot per ticker per trading day, idempotently, with correct US trading-date mapping.
- Snapshots reflect fixed methodology independent of UI toggle state.
- Percentile/z-score math is test-covered; cold-start guard works; methodology-mismatch records are excluded from windows.
- Trend chart renders with correct trading-day axis, sign coloring, and gap handling, and has an accessible text alternative.
- Net GEX on the page shows an own-history percentile read (or a clear cold-start state).
- No new DB/dependency introduced unless the existing backend genuinely can't support this (justify if so).

## Out of scope

- No retroactive backfill of historical GEX (EOD OI can't be reliably reconstructed). We accumulate forward; say so in the cold-start copy.
- No intraday/real-time history — EOD snapshots only.
- No cross-ticker magnitude comparison UI (the whole point is that it's invalid; own-history percentile replaces it).
- Don't refactor the GEX computation itself here — Phase 4 consumes its output.

When done, give me a diff summary, the storage design you landed on, and how you verified the percentile math.
