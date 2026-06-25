import type { ContractData, GexData, GexByStrike, GexByExpiry } from '@/types/market'
import { computePutCallRatio, computeIvSkew } from '@/lib/signals'

export type WallGeometry = 'normal' | 'stacked' | 'inverted' | 'unknown'
export type GexBalance   = 'one-sided' | 'two-sided' | 'mixed'

const RISK_FREE_RATE = parseFloat(process.env.NEXT_PUBLIC_GEX_RISK_FREE_RATE ?? '0.05')
const CONTRACT_MULTIPLIER = 100

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

export function blackScholesGamma(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  return normalPdf(d1) / (S * sigma * sqrtT)
}

// --- Derived-level helpers (Phase 2) ---

export function computeVolTrigger(byStrike: GexByStrike[], spotPrice: number): number | null {
  let best: number | null = null
  for (const s of byStrike) {
    if (s.strike < spotPrice && s.netGex > 0) {
      if (best === null || s.strike > best) best = s.strike
    }
  }
  return best
}

export function computeWallGeometry(
  callWall: number | null,
  putWall: number | null,
  spotPrice: number,
): WallGeometry {
  if (callWall == null || putWall == null) return 'unknown'
  if (Math.abs(callWall - putWall) <= spotPrice * 0.005) return 'stacked'
  if (callWall < putWall) return 'inverted'
  return 'normal'
}

export function computeGexBalance(netGex: number, absGex: number): GexBalance {
  if (absGex === 0) return 'mixed'
  const ratio = Math.abs(netGex) / absGex
  if (ratio >= 0.65) return 'one-sided'
  if (ratio <= 0.35) return 'two-sided'
  return 'mixed'
}

// --- Expiration helpers (Phase 1) ---

export function getDistinctExpirations(contracts: ContractData[]): Date[] {
  const seen = new Set<string>()
  const result: Date[] = []
  for (const c of contracts) {
    const key = c.expiration.toISOString().split('T')[0]
    if (!seen.has(key)) { seen.add(key); result.push(c.expiration) }
  }
  return result.sort((a, b) => a.getTime() - b.getTime())
}

export function filterContractsByExpirations(contracts: ContractData[], expirations: Date[]): ContractData[] {
  const keys = new Set(expirations.map(d => d.toISOString().split('T')[0]))
  return contracts.filter(c => keys.has(c.expiration.toISOString().split('T')[0]))
}

export function computeGexByExpiry(
  ticker: string,
  contracts: ContractData[],
  underlyingPrice: number,
  asOf: Date
): GexByExpiry[] {
  return getDistinctExpirations(contracts).map(expDate => {
    const expiry = expDate.toISOString().split('T')[0]
    const slice = contracts.filter(c => c.expiration.toISOString().split('T')[0] === expiry)
    return { expiry, gex: computeGex(ticker, slice, underlyingPrice, asOf) }
  })
}

// --- Charm & Vanna approximations (Phase 3) ---

export interface CharmData {
  dailyDollarFlow: number
  byExpiry: Array<{ expiry: string; flow: number; daysToExpiry: number }>
}

export interface VannaData {
  perVolPoint: number
}

// Calendar charm: ∂Δ/∂t = -∂Δ/∂T.
// Positive = delta increases as time passes (ITM options converging to intrinsic).
// Negative = delta decreases as time passes (OTM options decaying toward zero).
function blackScholesCharm(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  return -normalPdf(d1) * (2 * RISK_FREE_RATE * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT)
}

// Vanna: ∂Δ/∂σ = -φ(d1)·d2/σ.
// Positive for OTM options (delta rises as vol rises). Negative for deep ITM.
function blackScholesVanna(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  return -normalPdf(d1) * d2 / sigma
}

export function computeCharm(
  contracts: ContractData[],
  underlyingPrice: number,
  asOf: Date,
): CharmData {
  const byExpiryMap = new Map<string, { flow: number; daysToExpiry: number }>()
  let dailyDollarFlow = 0

  for (const c of contracts) {
    if (!c.openInterest || c.openInterest <= 0) continue
    if (!c.impliedVolatility || c.impliedVolatility <= 0) continue
    const T = timeToExpiryYears(c.expiration, asOf)
    if (T <= 0) continue

    const charm = blackScholesCharm(underlyingPrice, c.strike, T, c.impliedVolatility)
    // Dollar charm / day = charm(Δ/yr) × OI × 100 × S / 365.
    // No sign flip for puts: charm encodes ∂Δ/∂t uniformly (calls and puts share the same d1).
    // charm < 0 (OTM call decays toward 0) → dealer sells stock.
    // charm > 0 (OTM put decays toward 0) → dealer covers short stock hedge, buys.
    const directedFlow = charm * c.openInterest * CONTRACT_MULTIPLIER * underlyingPrice / 365
    dailyDollarFlow += directedFlow

    const expiry = c.expiration.toISOString().split('T')[0]
    const daysToExpiry = Math.round(T * 365)
    const existing = byExpiryMap.get(expiry) ?? { flow: 0, daysToExpiry }
    existing.flow += directedFlow
    byExpiryMap.set(expiry, existing)
  }

  const byExpiry = Array.from(byExpiryMap.entries())
    .map(([expiry, { flow, daysToExpiry }]) => ({ expiry, flow, daysToExpiry }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry))

  return { dailyDollarFlow, byExpiry }
}

export function computeVanna(
  contracts: ContractData[],
  underlyingPrice: number,
  asOf: Date,
): VannaData {
  let perVolPoint = 0

  for (const c of contracts) {
    if (!c.openInterest || c.openInterest <= 0) continue
    if (!c.impliedVolatility || c.impliedVolatility <= 0) continue
    const T = timeToExpiryYears(c.expiration, asOf)
    if (T <= 0) continue

    const vanna = blackScholesVanna(underlyingPrice, c.strike, T, c.impliedVolatility)
    // Dollar vanna / 1pp vol = vanna(Δ/σ) × OI × 100 × S × 0.01.
    // No sign flip for puts: calls and puts share the same vanna (same d1).
    // OTM call: d2 < 0 → vanna > 0 → dealers buy when vol rises.
    // OTM put: d2 > 0 → vanna < 0 → dealers sell when vol rises.
    perVolPoint += vanna * c.openInterest * CONTRACT_MULTIPLIER * underlyingPrice * 0.01
  }

  return { perVolPoint }
}

export function timeToExpiryYears(expiration: Date, asOf: Date = new Date()): number {
  return Math.max(0, (expiration.getTime() - asOf.getTime()) / (365 * 24 * 60 * 60 * 1000))
}

function computeZeroGamma(contracts: ContractData[], spotPrice: number, asOf: Date): number | null {
  const eligible = contracts.filter(
    c =>
      c.openInterest && c.openInterest > 0 &&
      c.impliedVolatility && c.impliedVolatility > 0 &&
      timeToExpiryYears(c.expiration, asOf) > 0
  )
  if (eligible.length === 0) return null

  const profile: Array<{ price: number; netGex: number }> = []
  for (let i = 0; i <= 60; i++) {
    const pct = -0.15 + i * 0.005
    const S = spotPrice * (1 + pct)
    let netGex = 0
    for (const c of eligible) {
      const T = timeToExpiryYears(c.expiration, asOf)
      const gamma = blackScholesGamma(S, c.strike, T, c.impliedVolatility!)
      const gex = gamma * c.openInterest! * CONTRACT_MULTIPLIER * S * S * 0.01
      netGex += c.optionType === 'call' ? gex : -gex
    }
    profile.push({ price: S, netGex })
  }

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1]
    if ((a.netGex >= 0) !== (b.netGex >= 0)) {
      const t = a.netGex / (a.netGex - b.netGex)
      return a.price + t * (b.price - a.price)
    }
  }
  return null
}

export function computeGex(
  ticker: string,
  contracts: ContractData[],
  underlyingPrice: number,
  asOf: Date = new Date()
): GexData {
  const byStrikeMap = new Map<number, { callGex: number; putGex: number }>()

  for (const c of contracts) {
    if (!c.openInterest || c.openInterest <= 0) continue
    if (!c.impliedVolatility || c.impliedVolatility <= 0) continue
    const T = timeToExpiryYears(c.expiration, asOf)
    if (T <= 0) continue

    const gamma = blackScholesGamma(underlyingPrice, c.strike, T, c.impliedVolatility)
    const gex = gamma * c.openInterest * CONTRACT_MULTIPLIER * underlyingPrice * underlyingPrice * 0.01
    const entry = byStrikeMap.get(c.strike) ?? { callGex: 0, putGex: 0 }
    if (c.optionType === 'call') entry.callGex += gex
    else entry.putGex -= gex
    byStrikeMap.set(c.strike, entry)
  }

  const byStrike: GexByStrike[] = Array.from(byStrikeMap.entries())
    .map(([strike, { callGex, putGex }]) => ({ strike, callGex, putGex, netGex: callGex + putGex }))
    .sort((a, b) => a.strike - b.strike)

  const netGex = byStrike.reduce((s, x) => s + x.netGex, 0)
  const absGex = byStrike.reduce((s, x) => s + Math.abs(x.callGex) + Math.abs(x.putGex), 0)
  const callWall = byStrike.length ? byStrike.reduce((b, x) => x.callGex > b.callGex ? x : b).strike : null
  const putWall = byStrike.length ? byStrike.reduce((b, x) => x.putGex < b.putGex ? x : b).strike : null

  return {
    ticker,
    underlyingPrice,
    netGex,
    absGex,
    regime: netGex >= 0 ? 'positive' : 'negative',
    callWall,
    putWall,
    zeroGamma: computeZeroGamma(contracts, underlyingPrice, asOf),
    byStrike,
    putCallRatio: computePutCallRatio(contracts),
    ivSkew: computeIvSkew(contracts, underlyingPrice),
  }
}
