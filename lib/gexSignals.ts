import type { WallGeometry, GexBalance } from '@/lib/gex'
import type { GexHistoryContext } from '@/lib/gexHistory'

export type SignalBand = 'weak' | 'moderate' | 'strong'
export type StructuralRegime = 'positive' | 'negative' | 'flip-line'

export interface SignalEngineInput {
  ticker: string
  spot: number
  netGex: number
  absGex: number
  callWall: number | null
  putWall: number | null
  zeroGamma: number | null
  volTrigger: number | null
  gexRegime: 'positive' | 'negative'   // from computeGex (net sign)
  wallGeometry: WallGeometry
  gexBalance: GexBalance
  historyContext: GexHistoryContext | null  // null = cold start, degrade gracefully
  snapshotTs: string                        // ISO timestamp for staleness
  isLeveraged: boolean
}

export interface GexSignal {
  id: string
  title: string
  structuralRead: string
  evidence: string[]   // exact levels/values that triggered the rule
  finalStrength: number
  band: SignalBand
}

export interface SignalEngineOutput {
  signals: GexSignal[]           // filtered to "strong", ranked by strength
  isStale: boolean
  staleHours: number
  structuralRegime: StructuralRegime
}

// All thresholds live here — no magic numbers in rule logic.
export const SIGNAL_CONFIG = {
  wallProximityPct: 0.015,      // spot within 1.5% of a wall → "at wall"
  flipProximityPct: 0.010,      // spot within 1.0% of zero gamma → "on flip line"
  tightBandPct: 0.05,           // |CW−PW| < 5% of spot → "tight" band
  oneSidedRatio: 0.65,          // |net|/abs >= this → one-sided book
  twoSidedRatio: 0.35,          // |net|/abs <= this → two-sided book
  extremeHighPct: 90,           // percentile >= this → historically extreme high
  extremeLowPct: 10,            // percentile <= this → historically extreme low
  staleHoursThreshold: 30,      // snapshot older than this (hours) → stale
  strongStrengthThreshold: 2.5, // finalStrength >= this → renders in UI
  maxSignals: 2,
  baseStrength: {
    strong_positive_pin: 2.0,    // needs corroboration (book or hist)
    at_call_wall: 2.0,           // needs book corroboration
    at_put_wall_hold: 2.0,       // needs book corroboration
    put_wall_break: 2.5,         // always strong — clear structural break
    regime_fragile: 3.5,         // always strong when on flip line
    negative_gamma_active: 2.0,  // needs book or hist corroboration
    stacked_walls: 2.5,          // always strong when geometry is stacked
    inverted_walls: 2.5,         // always strong when geometry is inverted
    historical_extreme: 2.0,     // reaches strong via histAdj (+0.5)
  } as Record<string, number>,
}

// Leveraged and inverse ETFs: the fund's own daily rebalance adds
// destabilizing flow on top of options gamma, dampening positive-gamma reads.
export const LEVERAGED_ETFS = new Set([
  'SOXL', 'SOXS', 'TQQQ', 'SQQQ', 'SPXL', 'SPXS', 'UPRO', 'SPXU',
  'UDOW', 'SDOW', 'TNA', 'TZA', 'URTY', 'SRTY', 'TECL', 'TECS',
  'FNGU', 'FNGD', 'LABU', 'LABD', 'NAIL', 'CURE', 'DFEN', 'DPST',
  'MIDU', 'UVXY', 'SVXY', 'WANT', 'HIBL', 'WEBL', 'HIBS',
])

// --- Formatting helpers (pure, no side effects) ---

function fmtSpot(v: number): string {
  return `$${v.toFixed(2)}`
}

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

function pctAway(a: number, b: number): string {
  return `${Math.abs(((a - b) / b) * 100).toFixed(1)}%`
}

function strengthBand(s: number): SignalBand {
  const cfg = SIGNAL_CONFIG
  if (s >= cfg.strongStrengthThreshold) return 'strong'
  if (s >= 1.5) return 'moderate'
  return 'weak'
}

// --- Regime ---

export function computeStructuralRegime(
  spot: number,
  zeroGamma: number | null,
  volTrigger: number | null,
  gexRegime: 'positive' | 'negative',
  flipProximityPct: number,
): StructuralRegime {
  const pivot = zeroGamma ?? volTrigger
  if (pivot != null) {
    const dist = Math.abs(spot - pivot) / spot
    if (dist <= flipProximityPct) return 'flip-line'
    return spot > pivot ? 'positive' : 'negative'
  }
  // Fallback when no structural pivot is available
  return gexRegime
}

// --- Signal engine (pure function) ---
// nowTs is injectable for deterministic tests; defaults to Date.now()

export function runSignalEngine(
  input: SignalEngineInput,
  nowTs: number = Date.now(),
): SignalEngineOutput {
  const cfg = SIGNAL_CONFIG
  const {
    ticker, spot, netGex, absGex,
    callWall, putWall, zeroGamma, volTrigger,
    gexRegime, wallGeometry, gexBalance,
    historyContext, snapshotTs, isLeveraged,
  } = input

  // --- Staleness ---
  const staleHours = (nowTs - new Date(snapshotTs).getTime()) / 3_600_000
  const isStale = staleHours > cfg.staleHoursThreshold
  const staleCapStr = cfg.strongStrengthThreshold - 0.01  // just below "strong"

  // --- Structural regime ---
  const structuralRegime = computeStructuralRegime(
    spot, zeroGamma, volTrigger, gexRegime, cfg.flipProximityPct,
  )
  const onFlipLine = structuralRegime === 'flip-line'

  // cap(s): apply flip-line and stale caps
  const cap = (s: number): number => {
    if (onFlipLine) s = Math.min(s, staleCapStr)
    if (isStale) s = Math.min(s, staleCapStr)
    return s
  }

  // --- Shared adjustments ---
  // Book-balance adjustment (corroborates or conflicts with directional regime signals)
  const bookAdj = gexBalance === 'one-sided' ? +0.5
    : gexBalance === 'two-sided' ? -0.5
    : 0

  // History directional corroboration
  const histHighExtreme = !!(historyContext?.sufficientHistory &&
    historyContext.percentile >= cfg.extremeHighPct)
  const histLowExtreme = !!(historyContext?.sufficientHistory &&
    historyContext.percentile <= cfg.extremeLowPct)

  // RawSignal includes regimeFamily for post-processing; stripped before output
  type RawSignal = GexSignal & { regimeFamily: 'positive' | 'negative' | 'any' }
  const candidates: RawSignal[] = []

  // --- 1. regime_fragile — evaluated first; when active it caps all others ---
  const pivot = zeroGamma ?? volTrigger
  if (pivot != null) {
    const dist = Math.abs(spot - pivot) / spot
    if (dist <= cfg.flipProximityPct) {
      const base = cfg.baseStrength.regime_fragile
      const s = isStale ? Math.min(base, staleCapStr) : base
      candidates.push({
        id: 'regime_fragile',
        title: 'Regime Flip Zone',
        structuralRead:
          'Spot is at the zero-gamma / vol-trigger crossover. Dealer hedging direction is undecided — either direction of momentum may accelerate or reverse sharply once spot clears this level.',
        evidence: [
          `Spot ${fmtSpot(spot)} · ` +
          (zeroGamma != null ? `Zero Gamma ${fmtSpot(zeroGamma)}` : `Vol Trigger ${fmtSpot(volTrigger!)}`) +
          ` · distance ${pctAway(spot, pivot)}`,
        ],
        finalStrength: s,
        band: strengthBand(s),
        regimeFamily: 'any',
      })
    }
  }

  // --- 2. strong_positive_pin ---
  // Requires: positive regime, sufficient history (percentile ≥ 65), spot inside
  // tight walls. Gates off when historyContext is unavailable (cold start).
  if (
    structuralRegime === 'positive' &&
    historyContext?.sufficientHistory &&
    historyContext.percentile >= 65 &&
    callWall != null && putWall != null &&
    spot > putWall && spot < callWall
  ) {
    const spread = Math.abs(callWall - putWall)
    if (spread < cfg.tightBandPct * spot) {
      let s = cfg.baseStrength.strong_positive_pin
      s += bookAdj
      if (histHighExtreme) s += 0.5
      if (isLeveraged) s -= 0.5
      s = cap(s)
      candidates.push({
        id: 'strong_positive_pin',
        title: 'Positive Gamma Pin',
        structuralRead:
          'Dealer hedging is creating a strong mean-reverting force. Expect fade-the-edges conditions while spot stays between the walls.',
        evidence: [
          `Net GEX ${fmtGex(netGex)} (${Math.round(historyContext.percentile)}th pct)`,
          `Spot ${fmtSpot(spot)} inside Put Wall ${fmtSpot(putWall)} / Call Wall ${fmtSpot(callWall)}`,
          `Wall spread ${fmtSpot(spread)} = ${(spread / spot * 100).toFixed(1)}% of spot`,
          ...(isLeveraged ? ['Leveraged ETF — daily rebalance flow partially offsets dealer stabilization'] : []),
        ],
        finalStrength: s,
        band: strengthBand(s),
        regimeFamily: 'positive',
      })
    }
  }

  // --- 3. at_call_wall ---
  // Spot approaching call wall from below (within wallProximityPct)
  if (structuralRegime === 'positive' && callWall != null) {
    const dist = Math.abs(spot - callWall) / spot
    if (dist <= cfg.wallProximityPct && spot <= callWall) {
      let s = cfg.baseStrength.at_call_wall
      s += bookAdj
      if (histHighExtreme) s += 0.5
      s = cap(s)
      candidates.push({
        id: 'at_call_wall',
        title: 'At Call Wall',
        structuralRead:
          'Dealer supply concentration at this strike creates overhead resistance. Historically a fade-the-rip / profit-target zone — dealers sell delta here.',
        evidence: [
          `Spot ${fmtSpot(spot)} · Call Wall ${fmtSpot(callWall)} · distance ${pctAway(spot, callWall)}`,
        ],
        finalStrength: s,
        band: strengthBand(s),
        regimeFamily: 'positive',
      })
    }
  }

  // --- 4. at_put_wall_hold ---
  // Spot approaching put wall from above (within wallProximityPct)
  if (structuralRegime === 'positive' && putWall != null) {
    const dist = Math.abs(spot - putWall) / spot
    if (dist <= cfg.wallProximityPct && spot > putWall) {
      let s = cfg.baseStrength.at_put_wall_hold
      s += bookAdj
      if (histHighExtreme) s += 0.5
      s = cap(s)
      candidates.push({
        id: 'at_put_wall_hold',
        title: 'At Put Wall Support',
        structuralRead:
          'Dealer bid concentration at this strike acts as mechanical support. Dealer hedging reinforces the level while spot holds above it.',
        evidence: [
          `Spot ${fmtSpot(spot)} · Put Wall ${fmtSpot(putWall)} · distance ${pctAway(spot, putWall)}`,
        ],
        finalStrength: s,
        band: strengthBand(s),
        regimeFamily: 'positive',
      })
    }
  }

  // --- 5. put_wall_break ---
  // Spot at or below put wall; regime already negative (support removed)
  if (structuralRegime === 'negative' && putWall != null && spot <= putWall) {
    let s = cfg.baseStrength.put_wall_break
    s += bookAdj
    if (histLowExtreme) s += 0.5
    s = cap(s)
    candidates.push({
      id: 'put_wall_break',
      title: 'Put Wall Break',
      structuralRead:
        'Mechanical support from dealer put-hedging has been removed. Dealer delta-hedging now amplifies rather than absorbs downside moves.',
      evidence: [
        `Spot ${fmtSpot(spot)} at or below Put Wall ${fmtSpot(putWall)}`,
        `Net GEX ${fmtGex(netGex)} — negative gamma regime`,
      ],
      finalStrength: s,
      band: strengthBand(s),
      regimeFamily: 'negative',
    })
  }

  // --- 6. negative_gamma_active ---
  if (structuralRegime === 'negative') {
    let s = cfg.baseStrength.negative_gamma_active
    s += bookAdj
    if (histLowExtreme) s += 0.5
    s = cap(s)
    const pivotLabel = zeroGamma != null
      ? `Zero Gamma ${fmtSpot(zeroGamma)}`
      : volTrigger != null ? `Vol Trigger ${fmtSpot(volTrigger)}` : 'net GEX negative'
    candidates.push({
      id: 'negative_gamma_active',
      title: 'Negative Gamma Active',
      structuralRead:
        'Dealers are amplifying price moves rather than absorbing them. Trending and volatility-expansion conditions — expect wider-than-normal swings.',
      evidence: [
        `Spot ${fmtSpot(spot)} below ${pivotLabel}`,
        `Net GEX ${fmtGex(netGex)}`,
      ],
      finalStrength: s,
      band: strengthBand(s),
      regimeFamily: 'negative',
    })
  }

  // --- 7. stacked_walls ---
  if (wallGeometry === 'stacked' && callWall != null && putWall != null) {
    const s = cap(cfg.baseStrength.stacked_walls)
    candidates.push({
      id: 'stacked_walls',
      title: 'Stacked Walls — Max-Pin Candidate',
      structuralRead:
        'Call and put dealer concentration cluster at the same strike. Expiry magnetism is elevated — price tends to be drawn to and pinned at this level near expiration.',
      evidence: [
        `Call Wall ${fmtSpot(callWall)} ≈ Put Wall ${fmtSpot(putWall)} · spread ${fmtSpot(Math.abs(callWall - putWall))}`,
      ],
      finalStrength: s,
      band: strengthBand(s),
      regimeFamily: 'any',
    })
  }

  // --- 8. inverted_walls ---
  if (wallGeometry === 'inverted' && callWall != null && putWall != null) {
    let s = cfg.baseStrength.inverted_walls
    if (isLeveraged) s += 0.25  // more common and meaningful in leveraged ETFs
    s = cap(s)
    candidates.push({
      id: 'inverted_walls',
      title: 'Inverted Walls — Squeeze Structure',
      structuralRead:
        'Call wall sits below the put wall, an unusual inversion common in leveraged instruments after sharp rallies. The normal mean-reversion dynamic is compressed.',
      evidence: [
        `Call Wall ${fmtSpot(callWall)} < Put Wall ${fmtSpot(putWall)}`,
        ...(isLeveraged ? [`${ticker} is a leveraged ETF — this inversion carries additional structural weight`] : []),
      ],
      finalStrength: s,
      band: strengthBand(s),
      regimeFamily: 'any',
    })
  }

  // --- 9. historical_extreme ---
  if (historyContext?.sufficientHistory) {
    const pct = historyContext.percentile
    if (pct >= cfg.extremeHighPct || pct <= cfg.extremeLowPct) {
      const isHigh = pct >= cfg.extremeHighPct
      let s = cfg.baseStrength.historical_extreme
      s += 0.5  // the histAdj — always corroborated by definition (this signal only fires at extremes)
      if (isHigh && isLeveraged) s -= 0.25  // rebalance flow reduces reliability of high-GEX reads
      s = cap(s)
      candidates.push({
        id: 'historical_extreme',
        title: isHigh
          ? 'Historically Elevated Dealer Positioning'
          : 'Historically Depressed Dealer Positioning',
        structuralRead: isHigh
          ? `Net GEX for ${ticker} is at an extreme high versus its own history. Dealer stabilization is at peak intensity for this ticker — mean-reversion forces are unusually strong.`
          : `Net GEX for ${ticker} is at an extreme low versus its own history. The normal dealer-hedging buffer is absent; moves may be larger than typical for this ticker.`,
        evidence: [
          `Net GEX ${fmtGex(netGex)} · ${Math.round(pct)}th percentile · trailing ${historyContext.windowSize} sessions`,
        ],
        finalStrength: s,
        band: strengthBand(s),
        regimeFamily: 'any',
      })
    }
  }

  // --- Mutual corroboration ---
  // If ≥2 signals in the same regime family both pass a baseline (≥1.5),
  // their mutual agreement boosts each by +0.25 (capped).
  const positiveFamily = candidates.filter(
    c => c.regimeFamily === 'positive' && c.finalStrength >= 1.5,
  )
  const negativeFamily = candidates.filter(
    c => c.regimeFamily === 'negative' && c.finalStrength >= 1.5,
  )
  if (positiveFamily.length >= 2) {
    positiveFamily.forEach(c => {
      c.finalStrength = cap(c.finalStrength + 0.25)
      c.band = strengthBand(c.finalStrength)
    })
  }
  if (negativeFamily.length >= 2) {
    negativeFamily.forEach(c => {
      c.finalStrength = cap(c.finalStrength + 0.25)
      c.band = strengthBand(c.finalStrength)
    })
  }

  // --- Filter, rank, cap at maxSignals ---
  const signals: GexSignal[] = candidates
    .filter(c => c.finalStrength >= cfg.strongStrengthThreshold)
    .sort((a, b) => b.finalStrength - a.finalStrength)
    .slice(0, cfg.maxSignals)
    .map(({ regimeFamily: _r, ...rest }) => rest)

  return { signals, isStale, staleHours, structuralRegime }
}
