import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'

const features = [
  { free: true,  paid: true,      label: "Today's market overview (all tickers)" },
  { free: true,  paid: true,      label: 'GEX profile chart' },
  { free: true,  paid: true,      label: 'Key levels (Call Wall, Put Wall, Zero Gamma)' },
  { free: 'SPY/QQQ/IWM', paid: '18+', label: 'Tickers with full GEX detail' },
  { free: false, paid: true,      label: 'Custom watchlist' },
  { free: false, paid: true,      label: '30-day GEX history' },
]

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let subscriptionStatus: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('subscription_status').eq('id', user.id).single()
    subscriptionStatus = profile?.subscription_status ?? 'free'
  }

  const isActive = subscriptionStatus === 'active'

  return (
    <>
      <Nav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1
            style={{
              fontFamily: 'var(--font-space), system-ui',
              fontWeight: 700, fontSize: 40, letterSpacing: '-0.03em',
              color: 'var(--text-1)', marginBottom: 12,
            }}
          >
            Simple pricing
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)' }}>
            One plan. No tiers to compare.
          </p>
        </div>

        {/* Comparison table */}
        <div
          style={{
            borderRadius: 10, border: '1px solid var(--border)',
            overflow: 'hidden', marginBottom: 32,
          }}
        >
          <div
            style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 160px',
              padding: '16px 24px', background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div />
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', textAlign: 'center' }}>
              Free
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cyan)', textAlign: 'center' }}>
              Pro
            </div>
          </div>

          {features.map((f, i) => (
            <div
              key={f.label}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 160px',
                padding: '14px 24px',
                borderBottom: i < features.length - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{f.label}</span>
              <div style={{ textAlign: 'center' }}>
                {f.free === true  ? <span style={{ color: 'var(--green)', fontSize: 15 }}>✓</span>
                : f.free === false ? <span style={{ color: 'var(--text-3)', fontSize: 15 }}>—</span>
                : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{f.free}</span>}
              </div>
              <div style={{ textAlign: 'center' }}>
                {f.paid === true  ? <span style={{ color: 'var(--green)', fontSize: 15 }}>✓</span>
                : f.paid === false ? <span style={{ color: 'var(--text-3)', fontSize: 15 }}>—</span>
                : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)' }}>{f.paid}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Pro CTA card */}
        <div
          style={{
            padding: '32px',
            borderRadius: 10,
            border: isActive ? '1px solid rgba(16,217,160,0.2)' : '1px solid rgba(34,211,238,0.2)',
            background: isActive
              ? 'linear-gradient(135deg, rgba(16,217,160,0.04) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(34,211,238,0.04) 0%, transparent 60%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 24,
          }}
        >
          <div>
            {isActive ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>
                  ✓ You&apos;re on Pro
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                  All features unlocked.
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span className="font-mono" style={{ fontSize: 40, lineHeight: 1, fontWeight: 700, color: 'var(--text-1)' }}>$9</span>
                  <span style={{ fontSize: 14, color: 'var(--text-3)' }}>/month</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                  Cancel anytime. No contracts.
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {isActive ? (
              <form action="/api/stripe/portal" method="POST">
                <button type="submit" className="btn-ghost" style={{ fontSize: 13 }}>
                  Manage subscription →
                </button>
              </form>
            ) : user ? (
              <form action="/api/stripe/checkout" method="POST">
                <button type="submit" className="btn-primary" style={{ fontSize: 15, padding: '12px 28px' }}>
                  Subscribe to Pro
                </button>
              </form>
            ) : (
              <>
                <Link href="/login" style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 13 }}>Sign in first</button>
                </Link>
                <Link href="/login" style={{ textDecoration: 'none' }}>
                  <button className="btn-primary" style={{ fontSize: 15, padding: '12px 28px' }}>
                    Subscribe to Pro
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
