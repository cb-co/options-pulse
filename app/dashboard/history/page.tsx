import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { Disclaimer } from '@/components/Disclaimer'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const { ticker: tickerParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('subscription_status').eq('id', user.id).single()

  const isPaid = profile?.subscription_status === 'active'

  if (!isPaid) {
    return (
      <>
        <Nav active="dashboard" />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
            <h1 style={{ fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 22, marginBottom: 10, color: 'var(--text-1)' }}>
              Digest History
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
              30-day digest history is available on the Pro plan.
            </p>
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <button className="btn-primary">Upgrade to Pro →</button>
            </Link>
          </div>
        </main>
      </>
    )
  }

  const { data: watchlistItems } = await supabase
    .from('watchlist_items').select('ticker').order('created_at')

  const tickers = (watchlistItems ?? []).map(w => w.ticker)
  const selectedTicker = tickerParam ?? tickers[0]

  const { data: digests } = selectedTicker
    ? await supabase
        .from('digests')
        .select('digest_date, narrative, unusualness_score')
        .eq('ticker', selectedTicker)
        .order('digest_date', { ascending: false })
        .limit(30)
    : { data: [] }

  return (
    <>
      <Nav active="dashboard" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <h1 style={{ fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            Digest History
          </h1>
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
            ← Back to dashboard
          </Link>
        </div>

        {/* Ticker tabs */}
        {tickers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 32 }}>
            {tickers.map(t => (
              <Link
                key={t}
                href={`/dashboard/history?ticker=${t}`}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 4,
                  textDecoration: 'none', letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: t === selectedTicker ? 'var(--amber)' : 'var(--surface)',
                  color: t === selectedTicker ? '#07090F' : 'var(--text-2)',
                  border: `1px solid ${t === selectedTicker ? 'var(--amber)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </Link>
            ))}
          </div>
        )}

        {/* Digest list */}
        {!digests?.length ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No history yet for this ticker.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {digests.map((d, i) => (
              <div
                key={d.digest_date}
                style={{
                  padding: '20px 0',
                  borderBottom: i < (digests.length - 1) ? '1px solid var(--border)' : 'none',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 24,
                  alignItems: 'start',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(d.digest_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {d.unusualness_score != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      score {Number(d.unusualness_score).toFixed(0)}
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, margin: 0 }}>
                  {d.narrative}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 48 }}>
          <Disclaimer />
        </div>
      </main>
    </>
  )
}
