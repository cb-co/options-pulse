import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.from('profiles').insert({ id: user.id, email: user.email })
  }

  const subscriptionStatus = profile?.subscription_status ?? 'free'
  const today = new Date().toISOString().split('T')[0]

  const { data: watchlistItems } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .order('created_at', { ascending: true })

  const tickers = (watchlistItems ?? []).map(w => w.ticker)

  const { data: digests } = tickers.length
    ? await supabase
        .from('digests')
        .select('ticker, narrative, unusualness_score')
        .eq('digest_date', today)
        .in('ticker', tickers)
    : { data: [] }

  const digestMap = new Map((digests ?? []).map(d => [d.ticker, d]))

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">My Dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/watchlist" className="text-blue-600">Manage watchlist</Link>
          <Link href="/account" className="text-gray-500">Account</Link>
        </div>
      </div>

      {tickers.length === 0 && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">Your watchlist is empty.</p>
          <Link href="/dashboard/watchlist" className="text-blue-600">Add a ticker →</Link>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {tickers.map(ticker => {
          const digest = digestMap.get(ticker)
          return (
            <div key={ticker} className="border rounded-lg p-5">
              <span className="font-bold text-xl">{ticker}</span>
              {digest ? (
                <p className="text-gray-700 mt-2 leading-relaxed">{digest.narrative}</p>
              ) : (
                <p className="text-gray-400 mt-2 text-sm">
                  Digest not yet available. Check back after 4pm ET.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {subscriptionStatus === 'free' && tickers.length > 0 && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium">Want to track more tickers?</p>
          <Link href="/pricing" className="text-blue-600">Upgrade to Pro →</Link>
        </div>
      )}

      <div className="mt-10 pt-6 border-t">
        <Disclaimer />
      </div>
    </main>
  )
}
