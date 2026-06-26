import {
  computePercentileRank,
  computeZScore,
  gexBand,
  computeGexHistoryContext,
  CANONICAL_METHODOLOGY,
  MIN_HISTORY_SESSIONS,
} from '@/lib/gexHistory'
import type { GexHistorySnapshot } from '@/lib/gexHistory'

function makeSnap(overrides: Partial<GexHistorySnapshot> = {}): GexHistorySnapshot {
  return {
    snapshot_date: '2025-01-01',
    net_gex: 0,
    abs_gex: 0,
    call_wall: null,
    put_wall: null,
    zero_gamma: null,
    underlying_price: 500,
    put_call_ratio: null,
    iv_skew: null,
    methodology: CANONICAL_METHODOLOGY,
    ...overrides,
  }
}

// Build a series of N snapshots with the given net_gex values (in date-DESC order)
function makeHistory(netGexValues: number[], methodology = CANONICAL_METHODOLOGY): GexHistorySnapshot[] {
  return netGexValues.map((net_gex, i) => makeSnap({
    snapshot_date: `2025-${String(12 - Math.floor(i / 30)).padStart(2, '0')}-${String(28 - (i % 28)).padStart(2, '0')}`,
    net_gex,
    methodology,
  }))
}

describe('computePercentileRank', () => {
  it('returns 0 for empty array', () => {
    expect(computePercentileRank([], 100)).toBe(0)
  })

  it('value smaller than all → percentile 0', () => {
    expect(computePercentileRank([10, 20, 30, 40, 50], 5)).toBe(0)
  })

  it('value larger than all → percentile 100', () => {
    expect(computePercentileRank([10, 20, 30, 40, 50], 55)).toBe(100)
  })

  it('value in middle of 10-element array', () => {
    // target=55 > [10,20,30,40,50] → 5 values below → 5/10 = 50th pct
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(computePercentileRank(values, 55)).toBe(50)
  })

  it('counts strictly below (not equal)', () => {
    expect(computePercentileRank([10, 20, 30, 40, 50], 30)).toBe(40)
  })
})

describe('computeZScore', () => {
  it('returns 0 for empty array', () => {
    expect(computeZScore([], 100)).toBe(0)
  })

  it('returns 0 when all values are equal (zero std)', () => {
    expect(computeZScore([5, 5, 5], 5)).toBe(0)
  })

  it('mean is zero, value at +1σ', () => {
    // values: [-1, 0, 1] → mean=0, variance=2/3, std=0.8165
    // z of 0.8165 ≈ 1
    const values = [-1, 0, 1]
    const mean = 0
    const std = Math.sqrt((1 + 0 + 1) / 3)
    expect(computeZScore(values, mean + std)).toBeCloseTo(1, 5)
  })
})

describe('gexBand', () => {
  it('depressed below 10th pct', () => {
    expect(gexBand(5)).toBe('depressed')
    expect(gexBand(9.9)).toBe('depressed')
  })

  it('below-normal 10–34', () => {
    expect(gexBand(10)).toBe('below-normal')
    expect(gexBand(34.9)).toBe('below-normal')
  })

  it('normal 35–64', () => {
    expect(gexBand(35)).toBe('normal')
    expect(gexBand(64.9)).toBe('normal')
  })

  it('elevated 65–89', () => {
    expect(gexBand(65)).toBe('elevated')
    expect(gexBand(89.9)).toBe('elevated')
  })

  it('extreme at 90+', () => {
    expect(gexBand(90)).toBe('extreme')
    expect(gexBand(100)).toBe('extreme')
  })
})

describe('computeGexHistoryContext', () => {
  it('returns sufficientHistory=false when fewer than MIN_HISTORY_SESSIONS match', () => {
    const snaps = makeHistory(Array(MIN_HISTORY_SESSIONS - 1).fill(1e9))
    const ctx = computeGexHistoryContext(snaps, 1e9)
    expect(ctx.sufficientHistory).toBe(false)
    expect(ctx.windowSize).toBe(MIN_HISTORY_SESSIONS - 1)
  })

  it('returns sufficientHistory=true at exactly MIN_HISTORY_SESSIONS', () => {
    const snaps = makeHistory(Array(MIN_HISTORY_SESSIONS).fill(1e9))
    const ctx = computeGexHistoryContext(snaps, 2e9)
    expect(ctx.sufficientHistory).toBe(true)
    expect(ctx.windowSize).toBe(MIN_HISTORY_SESSIONS)
  })

  it('excludes snapshots with null methodology', () => {
    const valid = makeHistory(Array(MIN_HISTORY_SESSIONS).fill(1e9))
    const stale = makeHistory(Array(10).fill(5e9), null as never)
    // valid + stale, ordered newest first
    const snaps = [...stale, ...valid]
    const ctx = computeGexHistoryContext(snaps, 2e9)
    // stale have null methodology and are excluded → only MIN_HISTORY_SESSIONS valid
    expect(ctx.windowSize).toBe(MIN_HISTORY_SESSIONS)
    expect(ctx.sufficientHistory).toBe(true)
  })

  it('excludes snapshots with mismatched methodology', () => {
    const validSnaps = makeHistory(Array(MIN_HISTORY_SESSIONS).fill(1e9))
    const mismatch = makeHistory(Array(5).fill(9e9), { expiry_count: 4, mode: 'full' })
    const snaps = [...mismatch, ...validSnaps]
    const ctx = computeGexHistoryContext(snaps, 2e9)
    expect(ctx.windowSize).toBe(MIN_HISTORY_SESSIONS)
  })

  it('respects windowDays limit', () => {
    const snaps = makeHistory(Array(80).fill(1e9))
    const ctx = computeGexHistoryContext(snaps, 2e9, 60)
    expect(ctx.windowSize).toBe(60)
  })

  it('correct percentile for known series', () => {
    // 20 values: 1..20 (net_gex in billions), today = 15e9
    // Values below 15e9: 14 → percentile = 14/20 * 100 = 70
    const snaps = makeHistory(Array.from({ length: 20 }, (_, i) => (i + 1) * 1e9))
    const ctx = computeGexHistoryContext(snaps, 15e9)
    expect(ctx.sufficientHistory).toBe(true)
    expect(ctx.percentile).toBe(70)
    expect(ctx.band).toBe('elevated')
  })

  it('extreme band for highest-ever value', () => {
    const snaps = makeHistory(Array(20).fill(1e9))
    const ctx = computeGexHistoryContext(snaps, 999e9)
    expect(ctx.band).toBe('extreme')
    expect(ctx.percentile).toBe(100)
  })

  it('depressed band for lowest-ever value', () => {
    const snaps = makeHistory(Array(20).fill(1e9))
    const ctx = computeGexHistoryContext(snaps, -999e9)
    expect(ctx.band).toBe('depressed')
    expect(ctx.percentile).toBe(0)
  })
})
