import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { GexCard } from '@/components/GexCard'
import { Disclaimer } from '@/components/Disclaimer'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, subscription_status').eq('id', user.id).single()

  if (!profile) {
    await supabase.from('profiles').insert({ id: user.id, email: user.email })
  }

  const subscriptionStatus = profile?.subscription_status ?? 'free'
  const isPaid = subscriptionStatus === 'active'
  const today = new Date().toISOString().split('T')[0]

  const { data: watchlistItems } = await supabase
    .from('watchlist_items').select('ticker').order('created_at', { ascending: true })

  const tickers = (watchlistItems ?? []).map((w: { ticker: string }) => w.ticker)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: snapshots } = tickers.length
    ? await db
        .from('gex_snapshots')
        .select('ticker, net_gex, abs_gex, regime, call_wall, put_wall, underlying_price')
        .eq('snapshot_date', today)
        .in('ticker', tickers)
    : { data: [] }

  type GexSnap = { ticker: string; net_gex: number | null; abs_gex: number | null; regime: string | null; call_wall: number | null; put_wall: number | null; underlying_price: number | null }
  const snapshotMap = new Map(((snapshots ?? []) as GexSnap[]).map(s => [s.ticker, s]))

  return (
    <>
      <Nav active="dashboard" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--text-1)', marginBottom: 4 }}>
              My watchlist
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isPaid && (
              <Link href="/dashboard/history" style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 13 }}>History</button>
              </Link>
            )}
            <Link href="/dashboard/watchlist" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 13 }}>Manage tickers</button>
            </Link>
            <Link href="/account" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 13 }}>Account</button>
            </Link>
          </div>
        </div>

        {tickers.length === 0 && (
          <div style={{ padding: '60px 32px', borderRadius: 8, border: '1px dashed var(--border-2)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Your watchlist is empty.</div>
            <Link href="/dashboard/watchlist" style={{ textDecoration: 'none' }}>
              <button className="btn-primary">Add a ticker</button>
            </Link>
          </div>
        )}

        {tickers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {tickers.map(ticker => {
              const s = snapshotMap.get(ticker)
              return (
                <GexCard
                  key={ticker}
                  ticker={ticker}
                  regime={s?.regime as 'positive' | 'negative' | null ?? null}
                  netGex={s?.net_gex != null ? Number(s.net_gex) : null}
                  callWall={s?.call_wall != null ? Number(s.call_wall) : null}
                  putWall={s?.put_wall != null ? Number(s.put_wall) : null}
                  underlyingPrice={s?.underlying_price != null ? Number(s.underlying_price) : null}
                />
              )
            })}
          </div>
        )}

        {!isPaid && tickers.length > 0 && (
          <div style={{ marginTop: 24, padding: '16px 20px', borderRadius: 8, border: '1px solid rgba(34,211,238,0.18)', background: 'rgba(34,211,238,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>Free plan — 1 ticker</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Upgrade to track unlimited tickers and access 30-day GEX history.</div>
            </div>
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <button className="btn-outline-cyan" style={{ fontSize: 13, padding: '8px 16px' }}>Upgrade to Pro</button>
            </Link>
          </div>
        )}

        <div style={{ marginTop: 48 }}><Disclaimer /></div>
      </main>
    </>
  )
}
