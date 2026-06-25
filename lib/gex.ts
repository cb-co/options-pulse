import type { ContractData, GexData, GexByStrike } from '@/types/market'
import { computePutCallRatio, computeIvSkew } from '@/lib/signals'

const RISK_FREE_RATE = parseFloat(process.env.GEX_RISK_FREE_RATE ?? '0.05')
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
