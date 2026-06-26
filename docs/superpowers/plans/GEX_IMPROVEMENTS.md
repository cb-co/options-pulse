# GEX Analyzer — Improvements & Feature Additions

You are working on a Next.js + Recharts gamma-exposure (GEX) analyzer. The known entry point is `app/gex/[ticker]/page.tsx`; the GEX math lives in a separate computation module and the data is populated by a once-daily cron (21:00 UTC / after US close) that snapshots open interest, IV, and contracts across the next 6 expirations.

This is a financial-correctness-sensitive tool, so accuracy matters more than speed. Work in the phases below, in order. **Do not start coding until you've completed Phase 0 and shown me a short plan.**

## Ground rules

- **Explore before you change.** Map the data layer first: where OI/gamma/IV come from, how the cron writes them, where snapshots are stored (DB? files?), and the exact GEX computation function(s). Confirm the schema before touching anything.
- **Fix root causes, not symptoms.** If a number is wrong, fix the calculation or the data source — don't paper over it in the view layer.
- **Verify financial conventions; never assume them.** Before relying on any Greek or sign convention, find where it's defined in the code and confirm it matches the spec in each task.
- **Keep new user-facing copy labeled as educational** ("structural / educational, not investment advice"). Don't add anything that reads as a trade recommendation.
- **New interactive controls must be accessible** — real labels, keyboard operable, correct ARIA roles/states, focus styles. Toggles and sliders especially.
- After each phase: run the build, run/extend tests, and summarize what changed and why before moving on.

---

## Phase 0 — Investigation & sanity checks (do this first, report back)

1. **Locate and document the GEX pipeline.** Produce a 1-paragraph map: data source → cron → storage → computation → page. Note the storage shape so later phases (history, per-expiration breakdown) have something to build on.

2. **Audit the core formula.** Confirm the implementation matches:
   - `GEX(strike) = Gamma × OI × 100 × Spot² × 0.01` (dollar gamma per 1% move)
   - Puts multiplied by **−1** (naive "dealers long calls / short puts" assumption), so `NetGEX = Σ(callGEX) − Σ(putGEX)`.
   - Report any deviation. Flag explicitly whether the put sign convention is applied **consistently** everywhere GEX is summed (net GEX, walls, zero-gamma solve, per-strike table).

3. **Run down the cross-ticker magnitude bug.** Current readings show QQQ net GEX (~$206B) at roughly 5× SPY (~$41.9B), which inverts the normal hierarchy (the S&P complex usually carries the most dealer gamma). Investigate and report root cause. Check specifically:
   - Are we pulling **SPX** as well as SPY, or SPY only? (If the goal is "the S&P dealer book," SPY-only sees a subset.)
   - Is the contract multiplier (100) and any share/notional convention **identical across every ticker**, with no per-ticker special-casing?
   - Is far-dated OI inflating QQQ? (Phase 1's per-expiration breakdown will help confirm.)
   - Is `Spot²` scaling being mistaken for a cross-ticker-comparable quantity anywhere? It isn't — higher-priced underlyings mechanically produce larger GEX.
   - **Deliverable:** root-cause explanation + proposed fix. Don't fix yet if it's entangled with Phase 1; just document.

4. **Add a test harness for the math.** Create unit tests that run the GEX pipeline against a small **fixed synthetic options chain** with hand-computed expected net GEX, call wall, put wall, and zero gamma. This locks correctness before we refactor. Use whatever test runner the repo already has; if none, set up the lightest reasonable option.

---

## Phase 1 — Expiration controls & per-expiration transparency

**Why:** Near-dated ATM options dominate the gamma profile; far-dated low-gamma OI parked at round strikes can silently pull the walls. The current "next 6" is fixed and opaque.

1. **Configurable expiration count.** Let the profile be computed over the N nearest expirations, N selectable in the UI (e.g., 1 / 2 / 4 / 6). Default 4. Recompute net GEX, walls, and zero gamma from the selected set. Don't hardcode 6 anywhere — drive it from config/state.

2. **0DTE-only toggle.** A toggle that restricts the profile to same-day-expiry contracts. This is the single highest-value addition. When 0DTE-only and the full profile disagree, that divergence is itself informative — make both easy to flip between.

3. **Per-expiration gamma contribution.** Surface how much each expiration contributes to net GEX and to each wall. Even a small stacked breakdown (gamma by expiry per strike, or a summary table) so a far-dated LEAPS strike can't move the Call Wall without it being visible. This is the diagnostic that confirms or kills the Phase 0 QQQ finding.

**Acceptance:** changing N or toggling 0DTE recomputes all derived levels correctly (verified against the Phase 0 tests extended with multi-expiry fixtures); the per-expiration view makes wall composition inspectable.

---

## Phase 2 — Derived levels & regime UX

**Why:** The raw numbers are there; the actionable framing isn't. The whole point of GEX is the regime call (above zero gamma = fade / stabilizing; below = follow / amplifying).

1. **Volatility-trigger approximation.** Add a derived level: the highest **positive-gamma** strike sitting **below spot** — the last gamma floor before the regime gives way. Label it clearly as an approximation of a "vol trigger," distinct from the mathematical zero-gamma crossover.

2. **Regime indicator.** A prominent, plain-language regime readout driven by spot vs zero gamma: e.g. "Positive gamma — dealers stabilizing (mean-reverting)" vs "Negative gamma — dealers amplifying (trending)." Include the **cushion**: signed distance and % from spot to zero gamma (large cushion = stable; spot riding the line = fragile).

3. **Abs vs Net GEX interpretation.** You already display both. Add a one-line derived read: when `AbsGEX ≫ NetGEX`, flag "two-sided / offsetting gamma (choppier)"; when `AbsGEX ≈ NetGEX`, flag "one-sided book (cleaner regime signal)." Use a sensible ratio threshold.

4. **Wall-geometry detection.** Detect and label the three configurations: normal (`PW < spot < CW`), **stacked** (call wall ≈ put wall at one strike → max-pin candidate), and **inverted** (`CW < PW` → squeeze structure, common in leveraged ETFs post-rally). A short tooltip per state.

**Acceptance:** every derived read updates live with N / 0DTE changes; copy is educational, not advice.

---

## Phase 3 — Time-decay pressures (stretch, do only if Phase 0–2 are solid)

**Why:** Pure gamma is a snapshot and misses two real flows.

1. **Charm pressure (approx.):** estimate delta decay per expiration (strongest into Friday/OPEX and EOD on 0DTE) and show directional bias. In positive gamma this often shows up as supportive drift into Friday's close.
2. **Vanna pressure (approx.):** estimate how dealer delta shifts as IV changes — the post-event "vol-crush rally" mechanism. Even a coarse, clearly-labeled-as-approximate indicator adds signal pure GEX can't.

Keep these clearly separated and labeled as modeled approximations.

---

## Phase 4 — Historical context

**Why:** `Spot²` scaling makes raw GEX uncomparable across tickers, so the only honest comparison is a ticker against **its own history**.

1. **Persist daily snapshots** (net GEX, abs GEX, walls, zero gamma, spot, P/C, IV skew) per ticker — extend whatever storage the cron already uses.
2. **Per-ticker GEX trend** (net GEX over time) on the ticker page.
3. **Normalize to own history:** show today's net GEX as a **percentile or z-score vs that ticker's trailing window**, so "+$17B" becomes "elevated/normal/depressed for SOXL." This replaces meaningless cross-ticker magnitude comparison with a meaningful intra-ticker one.

---

## Phase 5 — Data freshness & leveraged-ETF handling

1. **Freshness indicator.** Display the snapshot timestamp and an "as of EOD <date>" badge, with a subtle staleness cue as the next session ages (the signal is freshest at the open and decays intraday, especially for 0DTE). Don't imply real-time data we don't have.

2. **Leveraged-ETF flag.** For 2x/3x ETFs (SOXL, TQQQ, SPXL, etc.), surface a note that the fund's **own daily rebalance** adds a destabilizing, negative-gamma-like flow on top of options gamma — so a "positive gamma" leveraged ETF is less stable than a positive-gamma index. Detect via a maintained list or a leverage field; don't hardcode a single ticker.

---

## Chart polish (fold in wherever it fits)

- **Generalize the label-collision fix.** Whenever two reference lines (Spot, CW, PW, ZG) are within ~0.5% of each other, offset their labels (alternate left/right or stagger vertically) so they don't overprint — the QQQ 710.62/711 overlap is the canonical case. Make it a reusable function over all reference levels, not a per-pair patch.
- Keep the existing axis fixes ($ prefix, tickCount, widened y-axis).

---

## Acceptance criteria (whole project)

- Phase 0 tests pass and are extended in each phase; GEX math is locked by fixtures.
- N-expiration and 0DTE toggles recompute **all** derived levels correctly.
- The QQQ/SPY magnitude discrepancy is root-caused and either fixed or documented with a clear explanation.
- Put sign convention and `Spot²×0.01` scaling are provably consistent across every consumer of the GEX numbers.
- New controls are keyboard-accessible with correct ARIA.
- No user-facing copy reads as investment advice.

## Out of scope / don't do

- No real-time/intraday data feed (we're EOD-only by design) — just be honest about freshness.
- No paid data sources or new API keys without asking first.
- Don't refactor unrelated parts of the app.
- Don't "fix" the naive dealer-positioning assumption by inventing a dealer-vs-customer model — just make sure its limitations are visible (the net-GEX sign is least reliable near zero).

---

When you're done with each phase, give me a short diff summary and the reasoning, and pause before the next phase.
