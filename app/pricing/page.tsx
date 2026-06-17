import Link from 'next/link'
import { Nav } from '@/components/Nav'

const features = [
  { free: true,  paid: true,  label: "Today's Top Movers feed" },
  { free: true,  paid: true,  label: 'Signal chips (P/C, vol/OI, IV skew)' },
  { free: true,  paid: true,  label: 'AI narrative summaries' },
  { free: '1',   paid: '∞',   label: 'Watchlist tickers' },
  { free: false, paid: true,  label: 'Daily digest for watchlist' },
  { free: false, paid: true,  label: '30-day digest history' },
]

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui",
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
          {/* Table header */}
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
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--amber)', textAlign: 'center' }}>
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
                : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>{f.paid}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Pro CTA card */}
        <div
          style={{
            padding: '32px',
            borderRadius: 10,
            border: '1px solid rgba(245,158,11,0.2)',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, transparent 60%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 24,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span
                className="score-glow"
                style={{ fontSize: 40, lineHeight: 1 }}
              >
                $9
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-3)' }}>/month</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Cancel anytime. No contracts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 13 }}>Sign in first</button>
            </Link>
            <form action="/api/stripe/checkout" method="POST">
              <button type="submit" className="btn-primary" style={{ fontSize: 15, padding: '12px 28px' }}>
                Subscribe to Pro
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  )
}
