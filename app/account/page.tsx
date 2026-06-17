import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  free:      { label: 'Free',             color: 'var(--text-3)' },
  active:    { label: 'Pro',              color: 'var(--green)'  },
  canceled:  { label: 'Pro (canceled)',   color: 'var(--text-3)' },
  past_due:  { label: 'Pro (past due)',   color: 'var(--red)'    },
}

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, stripe_customer_id')
    .eq('id', user.id)
    .single()

  const status = profile?.subscription_status ?? 'free'
  const isPaid = status === 'active'
  const statusInfo = STATUS_LABELS[status] ?? { label: status, color: 'var(--text-2)' }

  return (
    <>
      <Nav active="dashboard" />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '56px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui",
              fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--text-1)',
            }}
          >
            Account
          </h1>
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
        </div>

        {/* Info rows */}
        <div
          style={{
            borderRadius: 8, border: '1px solid var(--border)',
            overflow: 'hidden', marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Email
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{user.email}</span>
          </div>

          <div
            style={{
              padding: '18px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Plan
            </span>
            <span
              style={{
                fontSize: 13, fontWeight: 600,
                color: statusInfo.color,
                fontFamily: "'Space Grotesk', system-ui",
              }}
            >
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Action */}
        {isPaid ? (
          <form action="/api/stripe/portal" method="POST">
            <button type="submit" className="btn-ghost" style={{ fontSize: 13 }}>
              Manage subscription →
            </button>
          </form>
        ) : (
          <div
            style={{
              padding: '20px 24px', borderRadius: 8,
              border: '1px solid rgba(196,151,58,0.18)',
              background: 'rgba(196,151,58,0.04)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>
                Upgrade to Pro
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Unlimited watchlist + 30-day history.
              </div>
            </div>
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <button className="btn-outline-amber" style={{ fontSize: 13, padding: '8px 16px' }}>
                $9/month →
              </button>
            </Link>
          </div>
        )}

        {/* Sign out */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--text-3)', padding: 0,
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </>
  )
}
