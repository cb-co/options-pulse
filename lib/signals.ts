// lib/signals.ts
import { ContractData, SignalData } from '@/types/market'

export function computePutCallRatio(contracts: ContractData[]): number | null {
  const callVol = contracts
    .filter(c => c.optionType === 'call')
    .reduce((sum, c) => sum + (c.volume ?? 0), 0)
  const putVol = contracts
    .filter(c => c.optionType === 'put')
    .reduce((sum, c) => sum + (c.volume ?? 0), 0)
  if (callVol === 0) return null
  return putVol / callVol
}

export function computeTopVolOiContracts(
  contracts: ContractData[],
  topN = 3
): SignalData['topVolOiContracts'] {
  return contracts
    .map(c => ({
      symbol: c.symbol,
      strike: c.strike,
      optionType: c.optionType,
      volOiRatio: (c.volume ?? 0) / Math.max(c.openInterest ?? 0, 1),
    }))
    .sort((a, b) => b.volOiRatio - a.volOiRatio)
    .slice(0, topN)
}

export function computeIvSkew(
  contracts: ContractData[],
  underlyingPrice: number,
  rangePercent = 0.1
): number | null {
  const lo = underlyingPrice * (1 - rangePercent)
  const hi = underlyingPrice * (1 + rangePercent)

  const otmCalls = contracts.filter(
    c =>
      c.optionType === 'call' &&
      c.strike > underlyingPrice &&
      c.strike <= hi &&
      c.impliedVolatility != null
  )
  const otmPuts = contracts.filter(
    c =>
      c.optionType === 'put' &&
      c.strike < underlyingPrice &&
      c.strike >= lo &&
      c.impliedVolatility != null
  )

  if (!otmCalls.length || !otmPuts.length) return null

  const avg = (arr: ContractData[]) =>
    arr.reduce((s, c) => s + c.impliedVolatility!, 0) / arr.length

  return avg(otmCalls) - avg(otmPuts)
}

export function computeUnusualnesScore(signals: SignalData): number {
  const maxVolOi = signals.topVolOiContracts[0]?.volOiRatio ?? 0
  const pcAdj = signals.putCallRatio != null ? Math.abs(signals.putCallRatio - 0.7) * 2 : 0
  const ivChangeMax = signals.ivChange
    ? Math.max(...Object.values(signals.ivChange).map(Math.abs))
    : 0
  return maxVolOi + pcAdj + ivChangeMax * 5
}

export function computeSignals(
  contracts: ContractData[],
  underlyingPrice: number,
  previousContracts?: ContractData[]
): SignalData {
  const signals: SignalData = {
    putCallRatio: computePutCallRatio(contracts),
    topVolOiContracts: computeTopVolOiContracts(contracts),
    ivSkew: computeIvSkew(contracts, underlyingPrice),
  }

  if (previousContracts?.length) {
    const prevMap = new Map(previousContracts.map(c => [c.symbol, c]))
    const volumeChange: Record<string, number> = {}
    const oiChange: Record<string, number> = {}
    const ivChange: Record<string, number> = {}

    for (const c of contracts) {
      const prev = prevMap.get(c.symbol)
      if (!prev) continue
      if (prev.volume != null && c.volume != null && prev.volume !== 0) {
        volumeChange[c.symbol] = (c.volume - prev.volume) / prev.volume
      }
      if (prev.openInterest != null && c.openInterest != null && prev.openInterest !== 0) {
        oiChange[c.symbol] = (c.openInterest - prev.openInterest) / prev.openInterest
      }
      if (prev.impliedVolatility != null && c.impliedVolatility != null) {
        ivChange[c.symbol] = c.impliedVolatility - prev.impliedVolatility
      }
    }

    if (Object.keys(volumeChange).length) signals.volumeChange = volumeChange
    if (Object.keys(oiChange).length) signals.oiChange = oiChange
    if (Object.keys(ivChange).length) signals.ivChange = ivChange
  }

  return signals
}
