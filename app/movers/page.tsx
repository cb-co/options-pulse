import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { DigestCard } from '@/components/DigestCard'
import type { SignalData } from '@/types/market'

export const revalidate = 3600

export default async function MoversPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: digests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative, signals')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <>
      <Nav active="movers" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 32,
              letterSpacing: '-0.02em',
              color: 'var(--text-1)',
              marginBottom: 6,
            }}
          >
            Top Movers
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{dateLabel}</p>
        </div>

        {!digests?.length ? (
          <div
            style={{
              padding: '48px 32px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Today&apos;s digest hasn&apos;t run yet.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Check back after 4pm ET on weekdays.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {digests.map((d, i) => (
              <DigestCard
                key={d.ticker}
                ticker={d.ticker}
                score={d.unusualness_score != null ? Number(d.unusualness_score) : null}
                narrative={d.narrative}
                signals={d.signals as unknown as SignalData}
                rank={i + 1}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
