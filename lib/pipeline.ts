// lib/pipeline.ts
import { getOptionChain } from '@/lib/marketData'
import { computeSignals, computeUnusualnesScore } from '@/lib/signals'
import { generateNarrative } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { FIXED_UNIVERSE } from '@/constants/tickers'
import type { ContractData } from '@/types/market'

const DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runDailyPipeline(
  date: Date
): Promise<{ processed: string[]; failed: string[] }> {
  const supabase = createAdminClient()
  const dateStr = date.toISOString().split('T')[0]

  // Build full ticker list: fixed universe + any user watchlist tickers
  const { data: watchlistItems } = await supabase.from('watchlist_items').select('ticker')
  const watchlistTickers = [...new Set((watchlistItems ?? []).map((w: { ticker: string }) => w.ticker))]
  const tickers = [...new Set([...FIXED_UNIVERSE, ...watchlistTickers])]

  // Load yesterday's snapshots for day-2 signals
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let prevSnapshots: unknown[] | null = null
  try {
    const prevResult = await Promise.race<{ data: unknown[] | null; error: unknown }>([
      supabase.from('option_snapshots').select('*').eq('snapshot_date', yesterdayStr) as Promise<{ data: unknown[] | null; error: unknown }>,
      new Promise<{ data: null; error: string }>(resolve =>
        setTimeout(() => resolve({ data: null, error: 'timeout' }), 2000)
      ),
    ])
    prevSnapshots = prevResult.data
  } catch {
    // prevSnapshots stays null — day-2 signals will be skipped
  }

  const processed: string[] = []
  const failed: string[] = []

  for (const ticker of tickers) {
    try {
      const chain = await getOptionChain(ticker)

      // Store raw snapshots
      const rows = chain.contracts.map(c => ({
        snapshot_date: dateStr,
        ticker,
        contract_symbol: c.symbol,
        expiration: c.expiration.toISOString().split('T')[0],
        strike: c.strike,
        option_type: c.optionType,
        volume: c.volume,
        open_interest: c.openInterest,
        implied_volatility: c.impliedVolatility,
        last_price: c.lastPrice,
      }))

      await supabase
        .from('option_snapshots')
        .upsert(rows, { onConflict: 'snapshot_date,contract_symbol' })

      // Map prior-day DB rows back to ContractData shape for day-2 signals
      const tickerPrev: ContractData[] = (prevSnapshots ?? [])
        .filter((s: { ticker: string }) => s.ticker === ticker)
        .map((s: {
          contract_symbol: string; expiration: string; strike: string | number;
          option_type: string; volume: number | null; open_interest: number | null;
          implied_volatility: string | number | null; last_price: string | number | null
        }) => ({
          symbol: s.contract_symbol,
          expiration: new Date(s.expiration),
          strike: Number(s.strike),
          optionType: s.option_type as 'call' | 'put',
          volume: s.volume,
          openInterest: s.open_interest,
          impliedVolatility: s.implied_volatility != null ? Number(s.implied_volatility) : null,
          lastPrice: s.last_price != null ? Number(s.last_price) : null,
          underlyingPrice: chain.underlyingPrice,
        }))

      const signals = computeSignals(
        chain.contracts,
        chain.underlyingPrice,
        tickerPrev.length ? tickerPrev : undefined
      )

      const unusualnessScore = computeUnusualnesScore(signals)
      const narrative = await generateNarrative(ticker, signals)

      await supabase.from('digests').upsert(
        { digest_date: dateStr, ticker, unusualness_score: unusualnessScore, signals, narrative },
        { onConflict: 'digest_date,ticker' }
      )

      processed.push(ticker)
    } catch (err) {
      console.error(`[pipeline] failed ${ticker}:`, err)
      failed.push(ticker)
    }

    await sleep(DELAY_MS)
  }

  return { processed, failed }
}
