import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATUS_LABELS: Record<string, string> = {
  free: 'Free',
  active: 'Pro (active)',
  canceled: 'Pro (canceled)',
  past_due: 'Pro (past due)',
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

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">Account</h1>

      <div className="border rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-500">Email</p>
        <p className="font-medium">{user.email}</p>
      </div>

      <div className="border rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-500">Plan</p>
        <p className="font-medium">{STATUS_LABELS[status] ?? status}</p>
      </div>

      {isPaid ? (
        <form action="/api/stripe/portal" method="POST">
          <button type="submit" className="border px-5 py-2 rounded-lg text-sm">
            Manage subscription →
          </button>
        </form>
      ) : (
        <a href="/pricing" className="text-blue-600 text-sm">Upgrade to Pro →</a>
      )}
    </main>
  )
}
