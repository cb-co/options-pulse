// lib/marketData.ts
// This is the ONLY place yahoo-finance2 should be imported.
// Swap this file when migrating to the TradeStation API.
import YahooFinance from 'yahoo-finance2'
import type { OptionChainData, ContractData } from '@/types/market'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const MAX_EXPIRATIONS = 6

export async function getOptionChain(ticker: string): Promise<OptionChainData> {
  // Fetch the base options chain — includes expirationDates and the underlying quote
  const optionMeta = await yahooFinance.options(ticker)
  const underlyingPrice = optionMeta.quote.regularMarketPrice ?? 0

  const expirations = optionMeta.expirationDates.slice(0, MAX_EXPIRATIONS)

  const allContracts: ContractData[] = []

  for (const expDate of expirations) {
    const chain = await yahooFinance.options(ticker, { date: expDate })
    const optionSet = chain.options[0]
    if (!optionSet) continue

    const toContract = (
      c: {
        contractSymbol: string
        strike: number
        volume?: number
        openInterest?: number
        impliedVolatility: number
        lastPrice: number
      },
      optionType: 'call' | 'put'
    ): ContractData => ({
      symbol: c.contractSymbol,
      expiration: new Date(expDate),
      strike: c.strike,
      optionType,
      volume: c.volume ?? null,
      openInterest: c.openInterest ?? null,
      impliedVolatility: c.impliedVolatility ?? null,
      lastPrice: c.lastPrice ?? null,
      underlyingPrice,
    })

    allContracts.push(
      ...optionSet.calls.map(c => toContract(c, 'call')),
      ...optionSet.puts.map(p => toContract(p, 'put'))
    )
  }

  return { ticker, underlyingPrice, contracts: allContracts }
}
