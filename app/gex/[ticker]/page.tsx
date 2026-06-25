import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { GexChart } from '@/components/GexChart'
import { RegimeBadge } from '@/components/RegimeBadge'
import { Disclaimer } from '@/components/Disclaimer'
import type { GexByStrike } from '@/types/market'

const FREE_TICKERS = new Set(['SPY', 'QQQ', 'IWM'])

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(3)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  return `${sign}$${abs.toFixed(0)}`
}

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

  const byStrike = (snap?.gex_by_strike as GexByStrike[] | null) ?? []

  const stats = [
    { label: 'Net GEX', value: snap?.net_gex != null ? fmtGex(Number(snap.net_gex)) : '--', color: snap?.net_gex != null ? (Number(snap.net_gex) >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' },
    { label: 'Abs GEX', value: snap?.abs_gex != null ? fmtGex(Math.abs(Number(snap.abs_gex))) : '--', color: 'var(--text-1)' },
    { label: 'Spot', value: snap?.underlying_price != null ? `$${Number(snap.underlying_price).toFixed(2)}` : '--', color: 'var(--cyan)' },
    { label: 'Call Wall', value: snap?.call_wall != null ? `$${snap.call_wall}` : '--', color: 'var(--green)' },
    { label: 'Put Wall', value: snap?.put_wall != null ? `$${snap.put_wall}` : '--', color: 'var(--red)' },
    { label: 'Zero Gamma', value: snap?.zero_gamma != null ? `$${Number(snap.zero_gamma).toFixed(1)}` : '--', color: 'var(--text-2)' },
  ]

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.01em', color: 'var(--text-1)', margin: 0 }}>
                {ticker}
              </h1>
              {snap?.regime && <RegimeBadge regime={snap.regime as 'positive' | 'negative'} />}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/movers" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>← All tickers</Link>
        </div>

        {/* Stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, marginBottom: 32, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {stats.map(s => (
            <div key={s.label} style={{ padding: '14px 18px', background: 'var(--surface)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
              <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        {!snap ? (
          <div style={{ padding: '48px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No GEX data for {ticker} today.</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Data is computed after market close on weekdays.</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>GEX profile</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                <span style={{ color: 'var(--green)' }}>Green bars</span> = call GEX (stabilizing) &nbsp;
                <span style={{ color: 'var(--red)' }}>Red bars</span> = put GEX (destabilizing)
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 8px 12px' }}>
              <GexChart
                data={byStrike}
                underlyingPrice={Number(snap.underlying_price)}
                callWall={snap.call_wall != null ? Number(snap.call_wall) : null}
                putWall={snap.put_wall != null ? Number(snap.put_wall) : null}
                zeroGamma={snap.zero_gamma != null ? Number(snap.zero_gamma) : null}
              />
            </div>

            {/* Supplementary */}
            {(snap.put_call_ratio != null || snap.iv_skew != null) && (
              <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                {snap.put_call_ratio != null && (
                  <span className={`chip ${Number(snap.put_call_ratio) > 1 ? 'chip-negative' : 'chip-positive'}`}>
                    P/C {Number(snap.put_call_ratio).toFixed(2)}
                  </span>
                )}
                {snap.iv_skew != null && (
                  <span className={`chip ${Number(snap.iv_skew) < -0.05 ? 'chip-negative' : Number(snap.iv_skew) > 0.05 ? 'chip-positive' : 'chip-neutral'}`}>
                    IV skew {Number(snap.iv_skew) > 0 ? '+' : ''}{(Number(snap.iv_skew) * 100).toFixed(1)}pp
                  </span>
                )}
              </div>
            )}

            {/* Strike table */}
            {byStrike.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 12 }}>Strike breakdown</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
                    {['Strike', 'Call GEX', 'Put GEX', 'Net GEX'].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</div>
                    ))}
                  </div>
                  {byStrike
                    .filter(s => s.strike >= Number(snap.underlying_price) * 0.85 && s.strike <= Number(snap.underlying_price) * 1.15)
                    .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
                    .slice(0, 20)
                    .map((s, i) => (
                      <div key={s.strike} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', padding: '10px 16px', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: i < 19 ? '1px solid var(--border)' : 'none' }}>
                        <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>${s.strike}</div>
                        <div className="font-mono" style={{ fontSize: 12, color: 'var(--green)' }}>{fmtGex(s.callGex)}</div>
                        <div className="font-mono" style={{ fontSize: 12, color: 'var(--red)' }}>{fmtGex(s.putGex)}</div>
                        <div className="font-mono" style={{ fontSize: 12, color: s.netGex >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtGex(s.netGex)}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 48 }}>
          <Disclaimer />
        </div>
      </main>
    </>
  )
}
