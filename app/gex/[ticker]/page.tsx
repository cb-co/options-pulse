import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { Disclaimer } from '@/components/Disclaimer'
import { GexExpiryControls } from '@/components/GexExpiryControls'
import { computeGexHistoryContext } from '@/lib/gexHistory'
import type { SerializedContractData } from '@/types/market'
import type { GexHistorySnapshot } from '@/lib/gexHistory'

const FREE_TICKERS = new Set(['SPY', 'QQQ', 'IWM'])

export default async function GexPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params
  const ticker = rawTicker.toUpperCase()
  if (ticker !== rawTicker) redirect(`/gex/${ticker}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!FREE_TICKERS.has(ticker)) {
    if (!user) redirect('/login?next=/gex/' + ticker)
    const { data: profile } = await supabase.from('profiles').select('subscription_status').eq('id', user.id).single()
    if (profile?.subscription_status !== 'active') redirect('/pricing')
  }

  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: snap } = await db
    .from('gex_snapshots')
    .select('*')
    .eq('snapshot_date', today)
    .eq('ticker', ticker)
    .single()

  // Fetch raw contracts so the client can recompute for any expiry window
  let serializedContracts: SerializedContractData[] = []
  if (snap) {
    const { data: contractRows } = await db
      .from('option_snapshots')
      .select('contract_symbol, expiration, strike, option_type, volume, open_interest, implied_volatility, last_price')
      .eq('snapshot_date', today)
      .eq('ticker', ticker)
    if (contractRows) {
      serializedContracts = (contractRows as Array<Record<string, unknown>>).map(r => ({
        symbol: r.contract_symbol as string,
        expiration: r.expiration as string,
        strike: r.strike as number,
        optionType: r.option_type as 'call' | 'put',
        volume: r.volume as number | null,
        openInterest: r.open_interest as number | null,
        impliedVolatility: r.implied_volatility as number | null,
        lastPrice: r.last_price as number | null,
        underlyingPrice: Number(snap.underlying_price),
      }))
    }
  }

  // Fetch trailing 60-session history for trend chart and own-history percentile.
  // Ordered DESC so computeGexHistoryContext gets newest-first; chart reverses to ASC.
  const { data: historyRows } = await db
    .from('gex_snapshots')
    .select('snapshot_date, net_gex, abs_gex, call_wall, put_wall, zero_gamma, underlying_price, put_call_ratio, iv_skew, methodology')
    .eq('ticker', ticker)
    .order('snapshot_date', { ascending: false })
    .limit(60)

  const historySnapshots: GexHistorySnapshot[] = (historyRows ?? []).map((r: Record<string, unknown>) => ({
    snapshot_date: r.snapshot_date as string,
    net_gex: Number(r.net_gex),
    abs_gex: Number(r.abs_gex),
    call_wall: r.call_wall != null ? Number(r.call_wall) : null,
    put_wall: r.put_wall != null ? Number(r.put_wall) : null,
    zero_gamma: r.zero_gamma != null ? Number(r.zero_gamma) : null,
    underlying_price: Number(r.underlying_price),
    put_call_ratio: r.put_call_ratio != null ? Number(r.put_call_ratio) : null,
    iv_skew: r.iv_skew != null ? Number(r.iv_skew) : null,
    methodology: r.methodology as GexHistorySnapshot['methodology'],
  }))

  // Pre-compute context server-side so the client doesn't need to re-derive it
  const historyContext = snap
    ? computeGexHistoryContext(historySnapshots, Number(snap.net_gex))
    : null

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header — static, no expiry dependency */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.01em', color: 'var(--text-1)', margin: 0 }}>
                {ticker}
              </h1>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/movers" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>← All tickers</Link>
        </div>

        {!snap ? (
          <div style={{ padding: '48px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No GEX data for {ticker} today.</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Data is computed after market close on weekdays.</div>
          </div>
        ) : (
          <GexExpiryControls
            ticker={ticker}
            snapshotDate={today}
            snapshotTs={snap.snapshot_ts ?? snap.created_at ?? (today + 'T21:00:00Z')}
            serializedContracts={serializedContracts}
            underlyingPrice={Number(snap.underlying_price)}
            initialRegime={snap.regime as 'positive' | 'negative'}
            historySnapshots={historySnapshots}
            historyContext={historyContext}
          />
        )}

        <div style={{ marginTop: 48 }}>
          <Disclaimer />
        </div>
      </main>
    </>
  )
}
