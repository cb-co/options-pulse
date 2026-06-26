import { getOptionChain } from '@/lib/marketData'
import { computeGex } from '@/lib/gex'
import { createAdminClient } from '@/lib/supabase/admin'
import { FIXED_UNIVERSE } from '@/constants/tickers'
import { CANONICAL_METHODOLOGY } from '@/lib/gexHistory'
import type { Json } from '@/types/supabase'

const DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runDailyPipeline(
  date: Date,
  onlyTickers?: string[]
): Promise<{ processed: string[]; failed: string[] }> {
  const supabase = createAdminClient()
  const dateStr = date.toISOString().split('T')[0]

  let tickers: string[]
  if (onlyTickers?.length) {
    tickers = onlyTickers.map(t => t.toUpperCase())
  } else {
    const { data: watchlistItems } = await supabase.from('watchlist_items').select('ticker')
    const watchlistTickers = [...new Set((watchlistItems ?? []).map((w: { ticker: string }) => w.ticker))]
    tickers = [...new Set([...FIXED_UNIVERSE, ...watchlistTickers])]
  }

  const processed: string[] = []
  const failed: string[] = []

  for (const ticker of tickers) {
    try {
      const chain = await getOptionChain(ticker)

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

      const { error: snapErr } = await supabase
        .from('option_snapshots')
        .upsert(rows, { onConflict: 'snapshot_date,contract_symbol' })
      if (snapErr) throw new Error(`option_snapshots upsert: ${snapErr.message}`)

      const gexData = computeGex(ticker, chain.contracts, chain.underlyingPrice, date)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: gexErr } = await (supabase as any).from('gex_snapshots').upsert(
        {
          snapshot_date: dateStr,
          ticker,
          underlying_price: chain.underlyingPrice,
          net_gex: gexData.netGex,
          abs_gex: gexData.absGex,
          zero_gamma: gexData.zeroGamma,
          call_wall: gexData.callWall,
          put_wall: gexData.putWall,
          regime: gexData.regime,
          gex_by_strike: gexData.byStrike as unknown as Json,
          put_call_ratio: gexData.putCallRatio,
          iv_skew: gexData.ivSkew,
          snapshot_ts: date.toISOString(),  // updated on every run, not just first insert
          methodology: CANONICAL_METHODOLOGY as unknown as Json,
        },
        { onConflict: 'snapshot_date,ticker' }
      )
      if (gexErr) throw new Error(`gex_snapshots upsert: ${gexErr.message}`)

      processed.push(ticker)
    } catch (err) {
      console.error(`[pipeline] failed ${ticker}:`, err)
      failed.push(ticker)
    }

    await sleep(DELAY_MS)
  }

  return { processed, failed }
}
