import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { RegimeBadge } from '@/components/RegimeBadge'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('subscription_status').eq('id', user.id).single()

  if (profile?.subscription_status !== 'active') redirect('/pricing')

  const { data: watchlistItems } = await supabase
    .from('watchlist_items').select('ticker').order('created_at')
  const tickers = (watchlistItems ?? []).map((w: { ticker: string }) => w.ticker)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: history } = tickers.length
    ? await db
        .from('gex_snapshots')
        .select('ticker, snapshot_date, net_gex, regime, call_wall, put_wall, underlying_price')
        .in('ticker', tickers)
        .gte('snapshot_date', cutoff.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: false })
    : { data: [] }

  return (
    <>
      <Nav active="dashboard" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            GEX history
          </h1>
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>← Dashboard</Link>
        </div>

        {!history?.length ? (
          <div style={{ padding: '48px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No history yet.</div>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr 120px 100px 100px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
              {['Date', 'Ticker', 'Regime', 'Net GEX', 'Call Wall', 'Put Wall'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</div>
              ))}
            </div>
            {(history ?? []).map((row: {
              ticker: string; snapshot_date: string; net_gex: number | null;
              regime: string | null; call_wall: number | null; put_wall: number | null;
              underlying_price: number | null
            }, i: number) => (
              <div key={`${row.ticker}-${row.snapshot_date}`} style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr 120px 100px 100px', padding: '10px 16px', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: i < (history ?? []).length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.snapshot_date}</div>
                <div style={{ fontFamily: 'var(--font-space), sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-1)' }}>{row.ticker}</div>
                <div>{row.regime && <RegimeBadge regime={row.regime as 'positive' | 'negative'} size="sm" />}</div>
                <div className="font-mono" style={{ fontSize: 12, color: row.net_gex != null && Number(row.net_gex) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {row.net_gex != null ? (Number(row.net_gex) >= 0 ? '+' : '') + `$${(Math.abs(Number(row.net_gex)) / 1e9).toFixed(2)}B` : '--'}
                </div>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--green)' }}>{row.call_wall != null ? `$${row.call_wall}` : '--'}</div>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--red)' }}>{row.put_wall != null ? `$${row.put_wall}` : '--'}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
