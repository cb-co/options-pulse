import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { GexCard } from '@/components/GexCard'

export const revalidate = 3600

export default async function MoversPage() {
  const supabase = await createClient()

  // Look back far enough to bridge weekends/holidays/a missed cron run — each
  // ticker's most recent row within the window wins, not an exact "today" match.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: snapshots } = await db
    .from('gex_snapshots')
    .select('ticker, snapshot_date, net_gex, abs_gex, regime, call_wall, put_wall, underlying_price')
    .gte('snapshot_date', cutoffStr)
    .order('snapshot_date', { ascending: false })

  type GexSnap = { ticker: string; snapshot_date: string; net_gex: number | null; abs_gex: number | null; regime: string | null; call_wall: number | null; put_wall: number | null; underlying_price: number | null }
  const latestByTicker = new Map<string, GexSnap>()
  for (const s of (snapshots ?? []) as GexSnap[]) {
    if (!latestByTicker.has(s.ticker)) latestByTicker.set(s.ticker, s)
  }
  const rows = [...latestByTicker.values()].sort((a, b) => (b.abs_gex ?? 0) - (a.abs_gex ?? 0))
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

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
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No recent GEX data available.</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Data is computed each weekday morning before market open.</div>
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
