'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--amber-dim)', border: '1px solid rgba(196,151,58,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 20,
            }}
          >
            ✉
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 22, marginBottom: 10, color: 'var(--text-1)' }}>
            Check your inbox
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
            We sent a sign-in link to <strong style={{ color: 'var(--text-1)' }}>{email}</strong>.
            Click it to access your dashboard.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal header */}
      <header style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <Link
          href="/"
          style={{
            fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 15,
            color: 'var(--text-1)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', display: 'block' }} />
          OptionPulse
        </Link>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui", fontWeight: 700,
              fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8, color: 'var(--text-1)',
            }}
          >
            Sign in
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 28, lineHeight: 1.5 }}>
            Enter your email to receive a sign-in link. No password required.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="input-dark"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && (
              <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>
            )}
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              Send sign-in link
            </button>
          </form>

          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 24, lineHeight: 1.5 }}>
            By continuing you agree that OptionPulse provides informational summaries only,
            not investment advice.
          </p>
        </div>
      </div>
    </div>
  )
}
