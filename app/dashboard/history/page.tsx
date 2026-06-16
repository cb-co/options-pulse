import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const { ticker: tickerParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const isPaid = profile?.subscription_status === 'active'

  if (!isPaid) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-4">Digest History</h1>
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            Digest history is available on the Pro plan.
          </p>
          <Link href="/pricing" className="bg-black text-white px-5 py-2 rounded-lg text-sm">
            Upgrade to Pro →
          </Link>
        </div>
      </main>
    )
  }

  const { data: watchlistItems } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .order('created_at')

  const tickers = (watchlistItems ?? []).map(w => w.ticker)
  const selectedTicker = tickerParam ?? tickers[0]

  const { data: digests } = selectedTicker
    ? await supabase
        .from('digests')
        .select('digest_date, narrative, unusualness_score')
        .eq('ticker', selectedTicker)
        .order('digest_date', { ascending: false })
        .limit(30)
    : { data: [] }

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Digest History</h1>

      <div className="flex gap-2 mb-8 flex-wrap">
        {tickers.map(t => (
          <Link
            key={t}
            href={`/dashboard/history?ticker=${t}`}
            className={`px-3 py-1 rounded-full text-sm border ${
              t === selectedTicker ? 'bg-black text-white border-black' : ''
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {(digests ?? []).map(d => (
          <div key={d.digest_date} className="border rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-1">
              {new Date(d.digest_date).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </p>
            <p className="text-gray-700 leading-relaxed">{d.narrative}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 pt-6 border-t">
        <Disclaimer />
      </div>
    </main>
  )
}
