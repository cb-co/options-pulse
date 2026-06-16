import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export const revalidate = 3600

export default async function LandingPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: topDigests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })
    .limit(3)

  return (
    <main className="max-w-4xl mx-auto px-4 py-20">
      <h1 className="text-5xl font-bold mb-4">OptionPulse</h1>
      <p className="text-xl text-gray-600 mb-12">
        Daily AI-written summaries of unusual options activity — no data dumps, just plain English.
      </p>

      {topDigests?.length ? (
        <>
          <h2 className="text-lg font-semibold mb-4 text-gray-500 uppercase tracking-wide">
            Today&apos;s top signals
          </h2>
          <div className="flex flex-col gap-4 mb-10">
            {topDigests.map(d => (
              <div key={d.ticker} className="border rounded-lg p-4">
                <span className="font-bold">{d.ticker}</span>
                <p className="text-gray-600 mt-1 text-sm">{d.narrative}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-gray-500 mb-10">Today&apos;s digest runs after 4pm ET. Come back later.</p>
      )}

      <div className="flex gap-4">
        <Link
          href="/movers"
          className="bg-black text-white px-6 py-3 rounded-lg font-medium"
        >
          View all movers
        </Link>
        <Link
          href="/login"
          className="border px-6 py-3 rounded-lg font-medium"
        >
          Track your tickers →
        </Link>
      </div>

      <div className="mt-16">
        <Disclaimer />
      </div>
    </main>
  )
}
