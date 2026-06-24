import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function Nav({ active }: { active?: 'movers' | 'dashboard' | 'guide' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const initial = user?.email?.[0]?.toUpperCase() ?? null

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cyan)', display: 'block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-space), system-ui, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            OptionPulse
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Link href="/movers" className={`nav-link${active === 'movers' ? ' nav-link-active' : ''}`}>Market</Link>
          <Link href="/gex/SPY" className="nav-link">GEX</Link>
          <Link href="/guide" className={`nav-link${active === 'guide' ? ' nav-link-active' : ''}`}>Guide</Link>
          <Link href="/dashboard" className={`nav-link${active === 'dashboard' ? ' nav-link-active' : ''}`}>Dashboard</Link>
        </nav>

        {user && initial ? (
          <Link href="/account" className="nav-avatar" title={user.email}>
            <span style={{ fontFamily: 'var(--font-space), system-ui, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--cyan)', lineHeight: 1 }}>{initial}</span>
          </Link>
        ) : (
          <Link href="/login" className="nav-sign-in">Sign in</Link>
        )}
      </div>
    </header>
  )
}
