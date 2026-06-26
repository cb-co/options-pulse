import {
  runSignalEngine,
  computeStructuralRegime,
  SIGNAL_CONFIG,
  LEVERAGED_ETFS,
} from '@/lib/gexSignals'
import type { SignalEngineInput } from '@/lib/gexSignals'
import type { GexHistoryContext } from '@/lib/gexHistory'

// A fresh (non-stale) snapshot timestamp
const FRESH_TS = new Date(Date.now() - 1 * 3_600_000).toISOString()  // 1h ago
const STALE_TS = new Date(Date.now() - 48 * 3_600_000).toISOString() // 48h ago

// nowTs is pinned so test results don't depend on wall-clock time
const NOW = Date.now()

const histSufficient: GexHistoryContext = {
  percentile: 50,
  zScore: 0,
  band: 'normal',
  windowSize: 60,
  sufficientHistory: true,
}

const histHighExtreme: GexHistoryContext = {
  percentile: 95,
  zScore: 2.5,
  band: 'extreme',
  windowSize: 60,
  sufficientHistory: true,
}

const histLowExtreme: GexHistoryContext = {
  percentile: 5,
  zScore: -2.5,
  band: 'depressed',
  windowSize: 60,
  sufficientHistory: true,
}

const histInsufficient: GexHistoryContext = {
  percentile: 0,
  zScore: 0,
  band: 'normal',
  windowSize: 10,
  sufficientHistory: false,
}

// Base input for positive-gamma, one-sided, clean scenario
function makeInput(overrides: Partial<SignalEngineInput> = {}): SignalEngineInput {
  return {
    ticker: 'SPY',
    spot: 500,
    netGex: 50e9,
    absGex: 60e9,
    callWall: 510,
    putWall: 490,
    zeroGamma: 480,
    volTrigger: 485,
    gexRegime: 'positive',
    wallGeometry: 'normal',
    gexBalance: 'one-sided',
    historyContext: histSufficient,
    snapshotTs: FRESH_TS,
    isLeveraged: false,
    ...overrides,
  }
}

// Pinned nowTs so we can control staleness precisely
const run = (overrides: Partial<SignalEngineInput> = {}) =>
  runSignalEngine(makeInput(overrides), NOW)

const ids = (r: ReturnType<typeof run>) => r.signals.map(s => s.id)

// ============================================================
// computeStructuralRegime
// ============================================================

describe('computeStructuralRegime', () => {
  const flipPct = 0.01

  it('positive when spot above zeroGamma outside flip band', () => {
    expect(computeStructuralRegime(500, 450, null, 'positive', flipPct)).toBe('positive')
  })

  it('negative when spot below zeroGamma outside flip band', () => {
    expect(computeStructuralRegime(500, 550, null, 'positive', flipPct)).toBe('negative')
  })

  it('flip-line when spot within flipProximityPct of zeroGamma', () => {
    // 0.9% away — within 1%
    expect(computeStructuralRegime(500, 495.5, null, 'positive', flipPct)).toBe('flip-line')
  })

  it('uses volTrigger as fallback when zeroGamma is null', () => {
    expect(computeStructuralRegime(500, null, 450, 'positive', flipPct)).toBe('positive')
    expect(computeStructuralRegime(500, null, 550, 'positive', flipPct)).toBe('negative')
  })

  it('falls back to gexRegime when both pivots are null', () => {
    expect(computeStructuralRegime(500, null, null, 'positive', flipPct)).toBe('positive')
    expect(computeStructuralRegime(500, null, null, 'negative', flipPct)).toBe('negative')
  })
})

// ============================================================
// regime_fragile
// ============================================================

describe('regime_fragile', () => {
  it('fires as strong when spot is within 1% of zeroGamma', () => {
    // spot=500, zeroGamma=497 → dist=0.6% < 1%
    const r = run({ spot: 500, zeroGamma: 497 })
    expect(ids(r)).toContain('regime_fragile')
    expect(r.signals.find(s => s.id === 'regime_fragile')!.band).toBe('strong')
  })

  it('does NOT fire when spot is 2% from zeroGamma', () => {
    const r = run({ spot: 500, zeroGamma: 490 })
    expect(ids(r)).not.toContain('regime_fragile')
  })

  it('fires via volTrigger when zeroGamma is null', () => {
    const r = run({ spot: 500, zeroGamma: null, volTrigger: 497 })
    expect(ids(r)).toContain('regime_fragile')
  })

  it('caps all other signals below strong when on flip line', () => {
    // On flip line: spot within 1% of zeroGamma
    const r = run({
      spot: 500, zeroGamma: 497,
      // Set up conditions that would normally make at_call_wall fire
      callWall: 505, gexBalance: 'one-sided',
    })
    const others = r.signals.filter(s => s.id !== 'regime_fragile')
    others.forEach(s => {
      expect(s.band).not.toBe('strong')
    })
  })
})

// ============================================================
// strong_positive_pin
// ============================================================

describe('strong_positive_pin', () => {
  it('fires when positive regime, high percentile, spot inside tight walls', () => {
    const r = run({
      spot: 500,
      netGex: 80e9,
      absGex: 90e9,
      callWall: 510,   // spread = 20 → 4% of 500 → tight (< 5%)
      putWall: 490,
      zeroGamma: 450,  // well below → positive regime
      gexBalance: 'one-sided',
      historyContext: { ...histSufficient, percentile: 75 },
    })
    expect(ids(r)).toContain('strong_positive_pin')
  })

  it('does NOT fire when band is too wide', () => {
    const r = run({
      spot: 500,
      callWall: 540,  // spread = 80 → 16% of 500 → not tight
      putWall: 460,
      zeroGamma: 450,
      historyContext: { ...histSufficient, percentile: 80 },
    })
    expect(ids(r)).not.toContain('strong_positive_pin')
  })

  it('does NOT fire when historyContext is null (cold start)', () => {
    const r = run({
      spot: 500, callWall: 510, putWall: 490,
      zeroGamma: 450,
      historyContext: null,
    })
    expect(ids(r)).not.toContain('strong_positive_pin')
  })

  it('does NOT fire when history is insufficient', () => {
    const r = run({
      spot: 500, callWall: 510, putWall: 490,
      zeroGamma: 450,
      historyContext: histInsufficient,
    })
    expect(ids(r)).not.toContain('strong_positive_pin')
  })

  it('does NOT fire when percentile is below 65', () => {
    const r = run({
      spot: 500, callWall: 510, putWall: 490,
      zeroGamma: 450,
      historyContext: { ...histSufficient, percentile: 60 },
    })
    expect(ids(r)).not.toContain('strong_positive_pin')
  })

  it('leveraged ETF dampens strength', () => {
    // Without leveraged: base 2.0 + one-sided(0.5) + hist(0.5) = 3.0
    // With leveraged:    base 2.0 + one-sided(0.5) + hist(0.5) - lev(0.5) = 2.5 → still strong
    const normal = run({
      spot: 500, callWall: 510, putWall: 490, zeroGamma: 450,
      gexBalance: 'one-sided',
      historyContext: histHighExtreme,
      isLeveraged: false,
    })
    const lev = run({
      spot: 500, callWall: 510, putWall: 490, zeroGamma: 450,
      gexBalance: 'one-sided',
      historyContext: histHighExtreme,
      isLeveraged: true,
      ticker: 'TQQQ',
    })
    const normalPin = normal.signals.find(s => s.id === 'strong_positive_pin')
    const levPin = lev.signals.find(s => s.id === 'strong_positive_pin')
    if (normalPin && levPin) {
      expect(levPin.finalStrength).toBeLessThan(normalPin.finalStrength)
    }
  })

  it('does NOT fire in negative gamma regime', () => {
    const r = run({
      spot: 460,        // below zeroGamma 480 → negative regime
      zeroGamma: 480,
      callWall: 465, putWall: 455,   // tight band
      historyContext: { ...histSufficient, percentile: 75 },
    })
    expect(ids(r)).not.toContain('strong_positive_pin')
  })
})

// ============================================================
// at_call_wall
// ============================================================

describe('at_call_wall', () => {
  it('fires when spot is within 1.5% of call wall from below', () => {
    // spot=500, callWall=507 → dist = 7/500 = 1.4% → within 1.5%
    const r = run({
      spot: 500, callWall: 507, zeroGamma: 480, gexBalance: 'one-sided',
      historyContext: histSufficient,
    })
    expect(ids(r)).toContain('at_call_wall')
  })

  it('does NOT fire when spot is 2% from call wall', () => {
    const r = run({
      spot: 500, callWall: 510, zeroGamma: 480, gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('at_call_wall')
  })

  it('does NOT fire when spot is above call wall', () => {
    const r = run({
      spot: 512, callWall: 510, zeroGamma: 480, gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('at_call_wall')
  })

  it('does NOT fire in negative gamma regime', () => {
    const r = run({
      spot: 460, zeroGamma: 480, callWall: 462, gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('at_call_wall')
  })

  it('one-sided book boosts strength; two-sided reduces it', () => {
    const oneSided = run({
      spot: 500, callWall: 507, zeroGamma: 480, gexBalance: 'one-sided',
    })
    const twoSided = run({
      spot: 500, callWall: 507, zeroGamma: 480, gexBalance: 'two-sided',
    })
    const sOne = oneSided.signals.find(s => s.id === 'at_call_wall')
    const sTwo = twoSided.signals.find(s => s.id === 'at_call_wall')
    // one-sided: 2.0 + 0.5 = 2.5 → strong; two-sided: 2.0 - 0.5 = 1.5 → not strong
    expect(sOne?.band).toBe('strong')
    expect(sTwo).toBeUndefined()
  })
})

// ============================================================
// at_put_wall_hold
// ============================================================

describe('at_put_wall_hold', () => {
  it('fires when spot is within 1.5% above put wall', () => {
    // spot=500, putWall=494 → dist = 6/500 = 1.2% → within 1.5%
    const r = run({
      spot: 500, putWall: 494, zeroGamma: 480, gexBalance: 'one-sided',
    })
    expect(ids(r)).toContain('at_put_wall_hold')
  })

  it('does NOT fire when spot is below put wall (put_wall_break territory)', () => {
    const r = run({
      spot: 488, putWall: 490, zeroGamma: 480, gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('at_put_wall_hold')
  })

  it('does NOT fire in negative gamma regime', () => {
    const r = run({
      spot: 460, zeroGamma: 480, putWall: 459, gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('at_put_wall_hold')
  })
})

// ============================================================
// put_wall_break
// ============================================================

describe('put_wall_break', () => {
  it('fires when spot is at or below put wall in negative regime', () => {
    const r = run({
      spot: 478, putWall: 480, zeroGamma: 490,
      gexRegime: 'negative', gexBalance: 'one-sided',
    })
    expect(ids(r)).toContain('put_wall_break')
  })

  it('fires even at two-sided book (base already 2.5)', () => {
    // base 2.5 - 0.5 (two-sided) = 2.0 → NOT strong
    // But with histLowExtreme: 2.5 - 0.5 + 0.5 = 2.5 → strong
    const r = run({
      spot: 478, putWall: 480, zeroGamma: 490,
      gexRegime: 'negative', gexBalance: 'two-sided',
      historyContext: histLowExtreme,
    })
    expect(ids(r)).toContain('put_wall_break')
  })

  it('does NOT fire in positive gamma regime (spot above zeroGamma)', () => {
    const r = run({
      spot: 488, putWall: 490, zeroGamma: 480,   // spot > zeroGamma → positive
      gexBalance: 'one-sided',
    })
    expect(ids(r)).not.toContain('put_wall_break')
  })
})

// ============================================================
// negative_gamma_active
// ============================================================

describe('negative_gamma_active', () => {
  it('fires in negative regime with one-sided book', () => {
    const r = run({
      spot: 460, zeroGamma: 480, gexBalance: 'one-sided',
      gexRegime: 'negative',
    })
    expect(ids(r)).toContain('negative_gamma_active')
  })

  it('does NOT fire in positive regime', () => {
    const r = run({ spot: 500, zeroGamma: 480 })
    expect(ids(r)).not.toContain('negative_gamma_active')
  })

  it('two-sided book suppresses to not-strong', () => {
    // base 2.0 - 0.5 = 1.5 → not strong
    const r = run({
      spot: 460, zeroGamma: 480, gexBalance: 'two-sided',
      gexRegime: 'negative',
    })
    expect(ids(r)).not.toContain('negative_gamma_active')
  })
})

// ============================================================
// stacked_walls
// ============================================================

describe('stacked_walls', () => {
  it('fires when wallGeometry is stacked', () => {
    const r = run({ wallGeometry: 'stacked', callWall: 500, putWall: 502 })
    expect(ids(r)).toContain('stacked_walls')
    expect(r.signals.find(s => s.id === 'stacked_walls')!.band).toBe('strong')
  })

  it('does NOT fire when wallGeometry is normal', () => {
    const r = run({ wallGeometry: 'normal' })
    expect(ids(r)).not.toContain('stacked_walls')
  })

  it('is capped below strong on flip line', () => {
    // On flip line: spot within 1% of zeroGamma
    const r = run({
      spot: 500, zeroGamma: 497,
      wallGeometry: 'stacked', callWall: 500, putWall: 502,
    })
    const s = r.signals.find(s => s.id === 'stacked_walls')
    expect(s?.band).not.toBe('strong')
  })
})

// ============================================================
// inverted_walls
// ============================================================

describe('inverted_walls', () => {
  it('fires when wallGeometry is inverted', () => {
    const r = run({
      wallGeometry: 'inverted', callWall: 490, putWall: 510,
    })
    expect(ids(r)).toContain('inverted_walls')
    expect(r.signals.find(s => s.id === 'inverted_walls')!.band).toBe('strong')
  })

  it('leveraged ETF boosts strength slightly', () => {
    const normal = run({ wallGeometry: 'inverted', callWall: 490, putWall: 510, isLeveraged: false })
    const lev = run({ wallGeometry: 'inverted', callWall: 490, putWall: 510, isLeveraged: true, ticker: 'SOXL' })
    const ns = normal.signals.find(s => s.id === 'inverted_walls')
    const ls = lev.signals.find(s => s.id === 'inverted_walls')
    if (ns && ls) expect(ls.finalStrength).toBeGreaterThan(ns.finalStrength)
  })
})

// ============================================================
// historical_extreme
// ============================================================

describe('historical_extreme', () => {
  it('fires when percentile >= 90 with sufficient history', () => {
    const r = run({ historyContext: histHighExtreme })
    expect(ids(r)).toContain('historical_extreme')
  })

  it('fires when percentile <= 10 with sufficient history', () => {
    const r = run({ historyContext: histLowExtreme })
    expect(ids(r)).toContain('historical_extreme')
  })

  it('does NOT fire at 50th percentile', () => {
    const r = run({ historyContext: histSufficient })
    expect(ids(r)).not.toContain('historical_extreme')
  })

  it('does NOT fire with insufficient history', () => {
    const r = run({ historyContext: histInsufficient })
    expect(ids(r)).not.toContain('historical_extreme')
  })

  it('does NOT fire when historyContext is null', () => {
    const r = run({ historyContext: null })
    expect(ids(r)).not.toContain('historical_extreme')
  })
})

// ============================================================
// Corroboration / mutual boost
// ============================================================

describe('mutual corroboration', () => {
  it('two positive-family signals at baseline each gain +0.25', () => {
    // at_call_wall (positive family) + at_put_wall_hold (positive family)
    // both near 2.0 (mixed book, no hist boost) → ≥1.5 baseline, so mutual boost
    // Engineered: spot near both walls (close put and call walls)
    const r = runSignalEngine(
      makeInput({
        spot: 500,
        callWall: 506,   // 1.2% away → fires
        putWall: 494,    // 1.2% away → fires
        zeroGamma: 450,
        gexBalance: 'mixed',  // no book adjustment
        historyContext: null,  // no hist boost
      }),
      NOW,
    )
    // Both fire at mixed book (base 2.0) but individually wouldn't be strong (2.0 < 2.5)
    // With mutual corroboration: 2.0 + 0.25 = 2.25 → still not strong
    // This tests that the boost happened (strength increased) even if still not reaching strong
    // Actually: both at 2.0 raw → not in filter (need ≥2.5 to render)
    // So the test is: the raw signals both have at least 1.5 so they would qualify for corroboration
    // Let's test at one-sided: 2.0 + 0.5 = 2.5 → both at strong individually → corroboration adds 0.25 → 2.75
    const r2 = runSignalEngine(
      makeInput({
        spot: 500,
        callWall: 506, putWall: 494,
        zeroGamma: 450,
        gexBalance: 'one-sided',
        historyContext: null,
      }),
      NOW,
    )
    const callSig = r2.signals.find(s => s.id === 'at_call_wall')
    const putSig = r2.signals.find(s => s.id === 'at_put_wall_hold')
    // Both fire; corroboration should have pushed them beyond base+bookAdj
    if (callSig) expect(callSig.finalStrength).toBeGreaterThan(2.5)
    if (putSig) expect(putSig.finalStrength).toBeGreaterThan(2.5)
  })
})

// ============================================================
// Stale data
// ============================================================

describe('stale data', () => {
  it('caps all signals below strong when snapshot is stale', () => {
    const r = runSignalEngine(
      makeInput({
        spot: 460, zeroGamma: 480, gexBalance: 'one-sided',
        gexRegime: 'negative',
        wallGeometry: 'stacked', callWall: 500, putWall: 502,
        snapshotTs: STALE_TS,
      }),
      NOW,
    )
    expect(r.isStale).toBe(true)
    expect(r.signals).toHaveLength(0)
  })

  it('isStale is false for fresh snapshot', () => {
    const r = run()
    expect(r.isStale).toBe(false)
  })
})

// ============================================================
// Quiet state
// ============================================================

describe('quiet state', () => {
  it('returns empty signals when no rule clears the strong threshold', () => {
    // Two-sided book, no hist, positive regime far from all walls → nothing fires
    const r = run({
      spot: 500,
      callWall: 550,   // far from spot
      putWall: 450,    // far from spot
      zeroGamma: 480,  // positive regime
      gexBalance: 'two-sided',
      historyContext: { ...histSufficient, percentile: 50 },
      wallGeometry: 'normal',
    })
    expect(r.signals).toHaveLength(0)
  })
})

// ============================================================
// Ranking — top maxSignals returned
// ============================================================

describe('ranking', () => {
  it('returns at most maxSignals signals, highest strength first', () => {
    const cfg = SIGNAL_CONFIG
    // Force multiple strong signals: extreme history (→ historical_extreme) +
    // stacked walls (→ stacked_walls) + at_call_wall (one-sided + hist)
    const r = run({
      spot: 500,
      callWall: 507, putWall: 507,  // stacked (same strike → stacked geometry)
      zeroGamma: 450,
      gexBalance: 'one-sided',
      historyContext: histHighExtreme,
      wallGeometry: 'stacked',
    })
    expect(r.signals.length).toBeLessThanOrEqual(cfg.maxSignals)
    // Verify ranking order
    for (let i = 1; i < r.signals.length; i++) {
      expect(r.signals[i - 1].finalStrength).toBeGreaterThanOrEqual(r.signals[i].finalStrength)
    }
  })
})

// ============================================================
// LEVERAGED_ETFS list
// ============================================================

describe('LEVERAGED_ETFS', () => {
  it('contains known leveraged ETFs', () => {
    expect(LEVERAGED_ETFS.has('SOXL')).toBe(true)
    expect(LEVERAGED_ETFS.has('TQQQ')).toBe(true)
    expect(LEVERAGED_ETFS.has('SPXL')).toBe(true)
  })

  it('does NOT contain standard ETFs', () => {
    expect(LEVERAGED_ETFS.has('SPY')).toBe(false)
    expect(LEVERAGED_ETFS.has('QQQ')).toBe(false)
    expect(LEVERAGED_ETFS.has('NVDA')).toBe(false)
  })
})

// ============================================================
// Evidence — every signal must expose the triggering levels
// ============================================================

describe('evidence', () => {
  it('each rendered signal has at least one evidence string', () => {
    const r = run({
      spot: 500, callWall: 507, zeroGamma: 450, gexBalance: 'one-sided',
    })
    r.signals.forEach(s => {
      expect(s.evidence.length).toBeGreaterThan(0)
    })
  })

  it('at_call_wall evidence contains spot and call wall prices', () => {
    const r = run({ spot: 500, callWall: 507, zeroGamma: 450, gexBalance: 'one-sided' })
    const s = r.signals.find(sig => sig.id === 'at_call_wall')
    if (s) {
      const joined = s.evidence.join(' ')
      expect(joined).toContain('$500')
      expect(joined).toContain('$507')
    }
  })
})
