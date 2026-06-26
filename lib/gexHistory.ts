export type GexBand = 'depressed' | 'below-normal' | 'normal' | 'elevated' | 'extreme'

export interface GexCanonicalMethodology {
  expiry_count: number
  mode: 'full' | 'zero-dte'
}

// The fixed methodology used by the cron for every canonical daily snapshot.
// Must match the expiry_count written in lib/pipeline.ts.
export const CANONICAL_METHODOLOGY: GexCanonicalMethodology = {
  expiry_count: 6,
  mode: 'full',
}

export const MIN_HISTORY_SESSIONS = 20
export const DEFAULT_WINDOW_DAYS = 60

export interface GexHistorySnapshot {
  snapshot_date: string
  net_gex: number
  abs_gex: number
  call_wall: number | null
  put_wall: number | null
  zero_gamma: number | null
  underlying_price: number
  put_call_ratio: number | null
  iv_skew: number | null
  methodology: GexCanonicalMethodology | null
}

export interface GexHistoryContext {
  percentile: number
  zScore: number
  band: GexBand
  windowSize: number
  sufficientHistory: boolean
}

export function computePercentileRank(values: number[], target: number): number {
  if (values.length === 0) return 0
  const below = values.filter(v => v < target).length
  return (below / values.length) * 100
}

export function computeZScore(values: number[], target: number): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return (target - mean) / std
}

export function gexBand(percentile: number): GexBand {
  if (percentile < 10) return 'depressed'
  if (percentile < 35) return 'below-normal'
  if (percentile < 65) return 'normal'
  if (percentile < 90) return 'elevated'
  return 'extreme'
}

function methodologyMatches(m: GexCanonicalMethodology | null): boolean {
  if (!m) return false
  return (
    m.expiry_count === CANONICAL_METHODOLOGY.expiry_count &&
    m.mode === CANONICAL_METHODOLOGY.mode
  )
}

// Given snapshots (ordered by date DESC, including today), places todayNetGex in
// historical context. Only snapshots with matching methodology are compared.
export function computeGexHistoryContext(
  snapshots: GexHistorySnapshot[],
  todayNetGex: number,
  windowDays = DEFAULT_WINDOW_DAYS
): GexHistoryContext {
  const valid = snapshots
    .filter(s => methodologyMatches(s.methodology))
    .slice(0, windowDays)

  if (valid.length < MIN_HISTORY_SESSIONS) {
    return {
      percentile: 0,
      zScore: 0,
      band: 'normal',
      windowSize: valid.length,
      sufficientHistory: false,
    }
  }

  const values = valid.map(s => s.net_gex)
  const percentile = computePercentileRank(values, todayNetGex)
  const zScore = computeZScore(values, todayNetGex)

  return {
    percentile,
    zScore,
    band: gexBand(percentile),
    windowSize: valid.length,
    sufficientHistory: true,
  }
}
