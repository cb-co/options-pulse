import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { DigestCard } from '@/components/DigestCard'
import type { SignalData } from '@/types/market'

export const revalidate = 3600

export default async function LandingPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: topDigests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative, signals')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })
    .limit(3)

  const hero = topDigests?.[0]

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

        {/* Hero */}
        <section style={{ paddingTop: 72, paddingBottom: 64 }}>
          {hero ? (
            /* Data-first hero: the top signal leads */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block', boxShadow: '0 0 8px var(--amber)' }} />
                <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--amber)', fontWeight: 600 }}>
                  Most unusual today
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    fontWeight: 700, fontSize: 80, lineHeight: 1,
                    letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                    color: 'var(--amber)',
                    textShadow: '0 0 80px rgba(245,158,11,0.55), 0 0 30px rgba(245,158,11,0.3), 0 0 8px rgba(245,158,11,0.2)',
                    filter: 'drop-shadow(0 0 40px rgba(245,158,11,0.15))',
                  }}
                >
                  {Number(hero.unusualness_score) >= 1000
                    ? Number(hero.unusualness_score).toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : Number(hero.unusualness_score).toFixed(0)}
                </span>
                <div>
                  <div className="ticker-label" style={{ fontSize: 22, color: 'var(--text-1)' }}>{hero.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>unusualness score</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 540, marginTop: 8 }}>
                {hero.narrative}
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 48 }}>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 56,
                  lineHeight: 1.05,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-1)',
                  marginBottom: 20,
                }}
              >
                Options flow,<br />decoded daily.
              </h1>
              <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 440 }}>
                AI-written summaries of unusual options activity — with the numbers to back them up.
              </p>
            </div>
          )}

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/movers" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ fontSize: 14 }}>
                View all movers →
              </button>
            </Link>
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 14 }}>
                Track your tickers
              </button>
            </Link>
          </div>
        </section>

        {/* Today's top 3 — only shown when data is available and we have more than just hero */}
        {topDigests && topDigests.length > 1 && (
          <section style={{ paddingBottom: 80 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>
                Today · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}
            >
              {topDigests.map((d, i) => (
                <DigestCard
                  key={d.ticker}
                  ticker={d.ticker}
                  score={d.unusualness_score != null ? Number(d.unusualness_score) : null}
                  narrative={d.narrative}
                  signals={d.signals as unknown as SignalData}
                  size="compact"
                  rank={i + 1}
                />
              ))}
            </div>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <Link
                href="/movers"
                style={{ fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}
              >
                All {' '}movers →
              </Link>
            </div>
          </section>
        )}

        {/* Value props — only shown when no data */}
        {!topDigests?.length && (
          <section style={{ paddingBottom: 80 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: '18 tickers', desc: 'Fixed universe of the most-active names — SPY, QQQ, NVDA, and more — updated daily.' },
                { label: 'Signal chips', desc: 'Put/call ratio, top vol/OI contract, and IV skew shown alongside every summary.' },
                { label: 'Plain English', desc: 'AI narrative that cites the actual numbers so you can verify what it\'s describing.' },
              ].map(p => (
                <div
                  key={p.label}
                  style={{ padding: '20px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', marginBottom: 8 }}>{p.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
