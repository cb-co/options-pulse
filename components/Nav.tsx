import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function Nav({ active }: { active?: 'movers' | 'dashboard' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const initial = user?.email?.[0]?.toUpperCase() ?? null

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(7,12,20,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span
            className="pulse-dot"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--amber)',
              display: 'block',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--text-1)',
              letterSpacing: '-0.01em',
            }}
          >
            OptionPulse
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Link
            href="/movers"
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              color: active === 'movers' ? 'var(--text-1)' : 'var(--text-2)',
              background: active === 'movers' ? 'var(--surface-3)' : 'transparent',
              transition: 'color 0.15s',
            }}
          >
            Top Movers
          </Link>
          <Link
            href="/dashboard"
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              color: active === 'dashboard' ? 'var(--text-1)' : 'var(--text-2)',
              background: active === 'dashboard' ? 'var(--surface-3)' : 'transparent',
              transition: 'color 0.15s',
            }}
          >
            Dashboard
          </Link>
        </nav>

        {/* Auth */}
        {user && initial ? (
          <Link
            href="/account"
            title={user.email}
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'border-color 0.15s',
            }}
          >
            <span
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: 'var(--amber)',
                lineHeight: 1,
              }}
            >
              {initial}
            </span>
          </Link>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border-2)',
              color: 'var(--text-2)',
              textDecoration: 'none',
              transition: 'color 0.15s, border-color 0.15s',
              flexShrink: 0,
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
