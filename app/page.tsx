import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { GexCard } from '@/components/GexCard'
import { RegimeBadge } from '@/components/RegimeBadge'

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${abs.toFixed(0)}`
}

export default async function LandingPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: snapshots } = await db
    .from('gex_snapshots')
    .select('ticker, net_gex, abs_gex, regime, call_wall, put_wall, zero_gamma, underlying_price')
    .eq('snapshot_date', today)
    .in('ticker', ['SPY', 'QQQ', 'IWM'])
    .order('abs_gex', { ascending: false })

  type GexSnap = { ticker: string; net_gex: number | null; abs_gex: number | null; regime: string | null; call_wall: number | null; put_wall: number | null; zero_gamma: number | null; underlying_price: number | null }
  const rows = (snapshots ?? []) as GexSnap[]
  const spy = rows.find(s => s.ticker === 'SPY')

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

        {/* Hero */}
        <section style={{ paddingTop: 72, paddingBottom: 64 }}>
          {spy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', display: 'inline-block', boxShadow: '0 0 8px var(--cyan)' }} />
                <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 600 }}>SPY — today</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span
                  className="font-mono"
                  style={{
                    fontWeight: 700, fontSize: 72, lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: spy.net_gex != null && spy.net_gex >= 0 ? 'var(--green)' : 'var(--red)',
                    textShadow: spy.net_gex != null && spy.net_gex >= 0
                      ? '0 0 60px rgba(16,217,160,0.4), 0 0 20px rgba(16,217,160,0.2)'
                      : '0 0 60px rgba(240,85,106,0.4), 0 0 20px rgba(240,85,106,0.2)',
                  }}
                >
                  {spy.net_gex != null ? fmtGex(spy.net_gex) : '--'}
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-space), sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>Net GEX</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>gamma exposure</div>
                </div>
              </div>
              {spy.regime && (
                <div style={{ marginTop: 4 }}>
                  <RegimeBadge regime={spy.regime as 'positive' | 'negative'} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '8px 24px', marginTop: 8, width: 'fit-content' }}>
                {[
                  { label: 'Call Wall', value: spy.call_wall != null ? `$${spy.call_wall}` : '--', color: 'var(--green)' },
                  { label: 'Put Wall', value: spy.put_wall != null ? `$${spy.put_wall}` : '--', color: 'var(--red)' },
                  { label: 'Zero Gamma', value: spy.zero_gamma != null ? `$${Number(spy.zero_gamma).toFixed(1)}` : '--', color: 'var(--text-2)' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                    <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 48 }}>
              <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 52, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'var(--text-1)', marginBottom: 16 }}>
                Gamma exposure,<br />made readable.
              </h1>
              <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 440 }}>
                Daily GEX analysis for SPY, QQQ, and 15+ active tickers. Identify dealer hedging regimes, key structural levels, and options flow concentration.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/gex/SPY" style={{ textDecoration: 'none' }}>
              <button className="btn-primary">Analyze SPY</button>
            </Link>
            <Link href="/movers" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost">All tickers</button>
            </Link>
            <Link href="/guide" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost">What is GEX?</button>
            </Link>
          </div>
        </section>

        {/* SPY / QQQ / IWM cards */}
        {rows.length > 0 && (
          <section style={{ paddingBottom: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>
                Major indices
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {rows.map(s => (
                <GexCard
                  key={s.ticker}
                  ticker={s.ticker}
                  regime={s.regime as 'positive' | 'negative' | null}
                  netGex={s.net_gex != null ? Number(s.net_gex) : null}
                  callWall={s.call_wall != null ? Number(s.call_wall) : null}
                  putWall={s.put_wall != null ? Number(s.put_wall) : null}
                  underlyingPrice={s.underlying_price != null ? Number(s.underlying_price) : null}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
