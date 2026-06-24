import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { GexCard } from '@/components/GexCard'

export const revalidate = 3600

export default async function MoversPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: snapshots } = await db
    .from('gex_snapshots')
    .select('ticker, net_gex, abs_gex, regime, call_wall, put_wall, underlying_price')
    .eq('snapshot_date', today)
    .order('abs_gex', { ascending: false })

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  type GexSnap = { ticker: string; net_gex: number | null; abs_gex: number | null; regime: string | null; call_wall: number | null; put_wall: number | null; underlying_price: number | null }
  const rows = (snapshots ?? []) as GexSnap[]

  return (
    <>
      <Nav active="movers" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--text-1)', marginBottom: 6 }}>
            Market overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{dateLabel} — ranked by absolute GEX</p>
        </div>

        {!rows.length ? (
          <div style={{ padding: '48px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Today&apos;s GEX data hasn&apos;t been computed yet.</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Check back after market close on weekdays.</div>
          </div>
        ) : (
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
        )}
      </main>
    </>
  )
}
