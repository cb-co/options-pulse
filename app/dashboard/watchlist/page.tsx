'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type WatchlistItem = { id: string; ticker: string }
type Profile = { subscription_status: string }

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newTicker, setNewTicker] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profileData }, { data: watchlistData }] = await Promise.all([
        supabase.from('profiles').select('subscription_status').eq('id', user.id).single(),
        supabase.from('watchlist_items').select('id, ticker').order('created_at'),
      ])
      setProfile(profileData)
      setItems(watchlistData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const isPaid = profile?.subscription_status === 'active'
  const atLimit = !isPaid && items.length >= 1

  async function addTicker(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return
    if (atLimit) { setError('Free plan is limited to 1 ticker.'); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: insertError } = await supabase
      .from('watchlist_items').insert({ user_id: user.id, ticker }).select().single()
    if (insertError) setError(insertError.message)
    else { setItems(prev => [...prev, data]); setNewTicker('') }
  }

  async function removeTicker(id: string) {
    const supabase = createClient()
    await supabase.from('watchlist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</span>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 13, color: 'var(--text-2)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ← Dashboard
          </Link>
          <span style={{ fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
            Manage Watchlist
          </span>
          <div style={{ width: 80 }} />
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        {/* Add form */}
        <form onSubmit={addTicker} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input-dark"
            type="text"
            placeholder="Add ticker (e.g. AAPL)"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
            disabled={atLimit}
            style={{ textTransform: 'uppercase' }}
          />
          <button type="submit" disabled={atLimit} className="btn-primary">
            Add
          </button>
        </form>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>
        )}

        {/* Free tier banner */}
        {atLimit && (
          <div
            style={{
              padding: '12px 16px', borderRadius: 6,
              border: '1px solid rgba(196,151,58,0.2)',
              background: 'rgba(196,151,58,0.05)',
              fontSize: 12, color: 'var(--text-2)',
              marginBottom: 24, lineHeight: 1.5,
            }}
          >
            Free plan tracks 1 ticker.{' '}
            <Link href="/pricing" style={{ color: 'var(--amber)', textDecoration: 'none' }}>
              Upgrade to Pro
            </Link>{' '}
            for unlimited.
          </div>
        )}

        {/* Ticker list */}
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 32, textAlign: 'center' }}>
            No tickers yet. Add one above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <li
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', borderRadius: 6,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}
              >
                <span
                  className="ticker-label"
                  style={{ fontSize: 14, color: 'var(--text-1)' }}
                >
                  {item.ticker}
                </span>
                <button
                  onClick={() => removeTicker(item.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--text-3)', padding: '4px 8px',
                    borderRadius: 4, transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
