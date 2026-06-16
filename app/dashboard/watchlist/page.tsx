'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type WatchlistItem = { id: string; ticker: string }
type Profile = { subscription_status: string }

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newTicker, setNewTicker] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
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

    if (atLimit) {
      setError('Free accounts are limited to 1 ticker. Upgrade to Pro to add more.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: insertError } = await supabase
      .from('watchlist_items')
      .insert({ user_id: user.id, ticker })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setItems(prev => [...prev, data])
      setNewTicker('')
    }
  }

  async function removeTicker(id: string) {
    await supabase.from('watchlist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return <main className="max-w-4xl mx-auto px-4 py-12">Loading...</main>

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">My Watchlist</h1>

      <form onSubmit={addTicker} className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="Ticker (e.g. AAPL)"
          value={newTicker}
          onChange={e => setNewTicker(e.target.value)}
          disabled={atLimit}
          className="border rounded px-3 py-2 flex-1 uppercase"
        />
        <button
          type="submit"
          disabled={atLimit}
          className="bg-black text-white rounded px-5 py-2 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {atLimit && (
        <p className="text-amber-700 text-sm mb-4 bg-amber-50 p-3 rounded">
          Free accounts track 1 ticker. <a href="/pricing" className="underline">Upgrade to Pro</a> for unlimited.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map(item => (
          <li key={item.id} className="flex items-center justify-between border rounded px-4 py-3">
            <span className="font-mono font-semibold">{item.ticker}</span>
            <button
              onClick={() => removeTicker(item.id)}
              className="text-red-500 text-sm hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
