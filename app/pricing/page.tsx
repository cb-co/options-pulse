export default function PricingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="text-4xl font-bold mb-4">Simple pricing</h1>
      <p className="text-gray-600 mb-12">One plan, no tiers to compare.</p>

      <div className="border rounded-2xl p-10 max-w-sm mx-auto">
        <div className="text-5xl font-bold mb-2">$9<span className="text-xl text-gray-500">/mo</span></div>
        <p className="text-gray-500 mb-8">OptionPulse Pro</p>
        <ul className="text-left space-y-3 mb-10 text-sm">
          {[
            'Unlimited watchlist tickers',
            'Daily AI digest for all your tickers',
            'Full digest history archive',
            "Today's Top Movers (always free)",
          ].map(f => (
            <li key={f} className="flex gap-2">
              <span>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <form action="/api/stripe/checkout" method="POST">
          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-lg font-medium"
          >
            Subscribe for $9/mo
          </button>
        </form>
      </div>
    </main>
  )
}
