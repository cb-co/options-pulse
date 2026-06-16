import { createClient } from '@/lib/supabase/server'
import { Disclaimer } from '@/components/Disclaimer'

export const revalidate = 3600

export default async function MoversPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: digests } = await supabase
    .from('digests')
    .select('ticker, unusualness_score, narrative')
    .eq('digest_date', today)
    .order('unusualness_score', { ascending: false })

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Today&apos;s Top Movers</h1>
      <p className="text-gray-500 mb-8">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {!digests?.length && (
        <p className="text-gray-500">Today&apos;s digest hasn&apos;t run yet. Check back after 4pm ET.</p>
      )}

      <div className="flex flex-col gap-6">
        {digests?.map(d => (
          <div key={d.ticker} className="border rounded-lg p-5">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-bold text-xl">{d.ticker}</span>
              <span className="text-sm text-gray-400">
                score: {d.unusualness_score?.toFixed(2)}
              </span>
            </div>
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
