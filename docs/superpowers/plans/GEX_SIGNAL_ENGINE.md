# GEX Analyzer — Signal Engine on the Ticker Page

Codify the GEX playbook into a deterministic, transparent **signal engine** and render a small section on `app/gex/[ticker]/page.tsx` that surfaces strong structural signals **only when they exist**. This is the capstone of the improvements plan — it consumes the outputs of the earlier phases (computed levels, derived regime levels, and own-history percentile).

**Design intent:** This is not a recommendation engine. Each signal describes a *structural / mechanical* condition (what dealer hedging is doing) and the playbook read for that condition — never "buy" or "sell," never sizing or entries. It must be **quiet by default**: if nothing clears the strength bar, the section shows a subtle "no strong signals" state, not manufactured noise. A signal engine that always fires something is worse than none.

## Ground rules

- **Explore before changing.** Confirm what's already computed: net GEX, abs GEX, call/put walls, zero gamma, spot, P/C, IV skew, and (if Phase 2/4 landed) the vol-trigger approximation, regime read, wall-geometry detection, and net-GEX percentile. The engine consumes these — it does not recompute GEX.
- **Pure function + config.** The engine is a pure function: `(snapshot + derived levels + history percentile + expiration/OPEX context) → ranked signals[]`. All thresholds live in a documented config object, never scattered as magic numbers.
- **Transparency is mandatory.** Every signal carries the exact evidence that triggered it (the levels/values and the rule). The user must be able to see *why* it fired. No opaque scores without the inputs behind them.
- **Educational framing only.** Structural conditions and playbook reads, not directives. No advice, no position sizing.
- **Accessible UI**, correct ARIA, keyboard reachable, matching existing styling. New controls/copy follow the app's conventions.
- Run build + tests after each step; summarize and pause before the next.

---

## Step 1 — Investigate inputs (report back before coding)

1. Enumerate exactly which of these are already available on the page/data layer, and their shapes: net GEX, abs GEX, call wall, put wall, zero gamma, spot, P/C, IV skew, vol-trigger approx, regime read, wall-geometry flag, net-GEX percentile, expiration calendar / OPEX awareness, leveraged-ETF flag, data freshness/timestamp.
2. For anything the signal catalog (Step 2) needs that doesn't exist yet, flag it. The engine should **degrade gracefully**: if a corroborating input is missing (e.g., percentile pre-cold-start), gate the signals that depend on it off rather than guessing.
3. Show me the proposed engine interface (types for input and output) before implementing.

---

## Step 2 — The signal engine

Implement a pure module that evaluates the playbook as discrete, named rules. Each rule produces a structured signal: `{ id, title, regimeGate, structuralRead, evidence[], baseStrength, corroborators[], conflicts[], finalStrength, band }`.

### Regime gating (enforce this first)

Determine the regime from spot vs zero gamma / vol trigger. **Regime gates which signals are even eligible:**

- **Positive gamma** (spot above zero gamma): fade/mean-reversion family is eligible; trend/follow family is suppressed.
- **Negative gamma** (spot below zero gamma / vol trigger): trend/follow family is eligible; fade family is suppressed.
- **On the flip line** (spot within `flipProximityPct` of zero gamma): neither family is high-confidence; emit only the "regime fragile / coin-flip" signal and cap all other strengths.

A "fade the rip at the Call Wall" signal and a "Put Wall break = acceleration" signal must never both present as strong simultaneously — the regime gate makes that structurally impossible.

### Signal catalog

Implement these as the initial rule set (thresholds → config):

| id | Trigger (thresholds in config) | Regime gate | Structural read |
|---|---|---|---|
| `strong_positive_pin` | net GEX strongly positive (high own-history percentile), spot inside walls, wall band tight (`< tightBandPct`) | positive | Strong dealer stabilization — mean-reversion / fade-the-edges conditions |
| `at_call_wall` | spot within `wallProximityPct` of call wall | positive | At sell-side resistance — fade-the-rip / profit-target zone |
| `at_put_wall_hold` | spot within `wallProximityPct` of put wall, still above it | positive | At buy-side support — dip-buy-if-it-holds setup |
| `put_wall_break` | spot at/below put wall | negative | Mechanical support removed — downside-acceleration risk |
| `regime_fragile` | spot within `flipProximityPct` of zero gamma | (gate) | Regime undecided — switch-playbook zone, low conviction |
| `negative_gamma_active` | spot below zero gamma / vol trigger | negative | Dealers amplifying — trend/follow, vol-expansion risk |
| `stacked_walls` | call wall ≈ put wall (within `stackPct`) | any | Max-pin candidate — heavy two-sided hedging at one strike |
| `inverted_walls` | call wall < put wall | any | Squeeze structure — common in leveraged ETFs post-rally |
| `historical_extreme` | net GEX at extreme own-history percentile (`>= extremeHighPct` or `<= extremeLowPct`) | any | Regime unusually strong/weak for this ticker |

### Strength scoring & corroboration

- Each rule has a `baseStrength`. Adjust by **corroborators** and **conflicts**:
  - **One-sided book** (Abs ≈ Net, within `oneSidedRatio`) → corroborates regime signals (cleaner signal).
  - **Two-sided book** (Abs ≫ Net) → reduces regime-signal strength (choppier).
  - **Historical extremity** (Phase 4 percentile) → corroborates same-direction regime signals.
  - **Multiple eligible signals agreeing** → mutual corroboration.
  - **Leveraged-ETF flag** → *reduces* the strength/stability of any "stable positive gamma" read (the fund's own rebalance is destabilizing).
  - **Stale data** (Phase 5 freshness) → caps strength and annotates; never present an aged EOD snapshot as a live signal.
- Map `finalStrength` to a band (e.g., weak / moderate / strong). **Only `strong` renders** in the section (threshold configurable).
- Rank surviving strong signals; show at most the top `maxSignals` (default 2). If none, render the quiet "no strong signals" state.

### Config object

Expose every threshold with a comment explaining it: `wallProximityPct`, `flipProximityPct`, `tightBandPct`, `stackPct`, `oneSidedRatio`, `extremeHighPct`, `extremeLowPct`, `strongStrengthThreshold`, `maxSignals`, plus per-rule `baseStrength`. No magic numbers in rule logic.

---

## Step 3 — Tests

Extend the fixture test suite. For each rule:

- **Fires when it should** — a fixture that crosses the threshold produces the signal at the expected band.
- **Stays quiet when it shouldn't** — near-miss fixtures produce nothing strong.
- **Regime gating** — a fade-family fixture in negative gamma is suppressed, and vice versa; a flip-line fixture caps everything and emits only `regime_fragile`.
- **Corroboration/conflict math** — one-sided vs two-sided book moves strength in the right direction; leveraged-ETF flag dampens; stale data caps.
- **Ranking & quiet state** — when multiple fire, top-N by strength; when none clear the bar, the engine returns empty (UI shows the quiet state).

The engine being a pure function makes all of this deterministic — no mocking the page.

---

## Step 4 — UI section

On the ticker page, add a compact **Signals** section:

- **Quiet by default.** When the engine returns nothing strong, show a subtle, low-emphasis "No strong structural signals right now" line — not a card competing for attention.
- When strong signals exist, render up to `maxSignals` compact items. Each shows: title, one-line structural read, the **evidence** (the levels/values that triggered it, e.g. "spot $229.57 within 0.2% of Call Wall $230"), and a strength indicator.
- A short, persistent **educational disclaimer**: these are structural/mechanical conditions derived from dealer-hedging models, not investment advice, computed from EOD data.
- **Freshness-aware:** if data is stale (Phase 5), annotate the section and visibly reflect the capped strength.
- Accessible: section landmark/heading, signals as a readable list, strength conveyed by more than color alone, keyboard reachable. Match existing visual conventions; keep it small — it must not dominate the page.

---

## Acceptance criteria

- Engine is a pure, test-covered function; all thresholds config-driven and documented.
- Regime gating makes contradictory signals structurally impossible.
- Section is genuinely quiet when nothing is strong; never manufactures signals to fill space.
- Every rendered signal exposes the evidence that triggered it.
- Strength correctly reflects corroboration (one-sided book, historical extremity), conflicts, leveraged-ETF dampening, and staleness capping.
- Gracefully degrades when optional inputs (percentile, vol trigger, OPEX context) are absent.
- No copy reads as advice/sizing/entries; educational disclaimer present.
- Accessible and visually consistent with the page.

## Out of scope

- No buy/sell/entry/exit/sizing output — structural reads only.
- No auto-trading, alerts, or notifications in this phase (engine output could feed those later; not now).
- Don't recompute GEX or modify the computation layer — consume its outputs.
- Don't add signals beyond the catalog without flagging them; keep the initial set tight and well-tested.
- Don't lower the strong-signal threshold to make the section feel "active" — quiet is correct when conditions are quiet.

When done, give me the rule list with final thresholds, the test coverage summary, and a few worked examples (inputs → which signals fire at which strength, including a "nothing fires" case).
