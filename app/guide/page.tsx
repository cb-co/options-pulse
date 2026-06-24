import { Nav } from '@/components/Nav'

export default function GuidePage() {
  return (
    <>
      <Nav active="guide" />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em', marginBottom: 8, color: 'var(--text-1)' }}>
          How to read GEX
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 48 }}>A practical reference for interpreting Gamma Exposure data.</p>

        {[
          {
            title: 'What is Gamma Exposure (GEX)?',
            body: `GEX measures the aggregate net gamma position held by options market makers across all strikes and expirations. It tells you how much dealers must buy or sell the underlying per 1% move in price to remain delta-neutral.

  The formula:
    GEX = Gamma × Open Interest × 100 × Spot²

Call options add positive GEX (stabilizing). Put options add negative GEX (destabilizing). Net GEX is the sum across all strikes.`,
          },
          {
            title: 'Positive vs negative gamma regimes',
            body: `When Net GEX is positive, dealers are long gamma. As price rises they sell, as it falls they buy — dampening moves. Expect tighter ranges and mean-reverting behavior.

When Net GEX is negative, dealers are short gamma. They buy as price rises and sell as it falls — amplifying moves. Intraday ranges expand, VIX tends to spike, and trending strategies have an edge.`,
          },
          {
            title: 'Reading the GEX profile chart',
            body: `Green bars above zero show strikes with dominant call open interest. These act as magnetic resistance — dealers sell rallies into them.

Red bars below zero show put-dominated strikes. These can accelerate downside as dealers sell through them.

The tallest green bar is the Call Wall. The deepest red bar is the Put Wall. Together they form the dealer-driven support/resistance range for the day.`,
          },
          {
            title: 'Key structural levels',
            body: `Call Wall: The strike with the highest net call GEX. Dealers selling calls at this strike create mechanical selling pressure as spot approaches it from below.

Put Wall: The strike with the most negative put GEX. Dealer delta-hedging of short puts creates buying pressure near this level.

Zero Gamma: The price level where the simulated GEX profile crosses zero. Above it, you are in a positive gamma regime. Below it, negative. This is calculated by re-running the GEX formula across a range of hypothetical spot prices.`,
          },
          {
            title: 'Limitations of this data',
            body: `This tool uses end-of-day open interest from Yahoo Finance. OI updates once per day after settlement — it does not reflect intraday position changes. 0DTE options (same-day expiry) are included when available but represent a subset of total flow.

GEX is a mechanical structural measure, not a sentiment indicator. It tells you where dealer hedging flows are concentrated, not what the market will do. Always combine with price action and broader context.`,
          },
        ].map(section => (
          <section key={section.title} style={{ marginBottom: 40, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-space), sans-serif', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--text-1)', marginBottom: 16 }}>
              {section.title}
            </h2>
            {section.body.split('\n\n').map((para, i) => (
              para.trim().startsWith('The formula') || para.trim().startsWith('GEX =') ? (
                <pre key={i} style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, color: 'var(--cyan)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 16px', overflowX: 'auto', marginBottom: 12 }}>
                  {para.trim().replace('The formula:\n  ', '')}
                </pre>
              ) : (
                <p key={i} style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 12px' }}>{para.trim()}</p>
              )
            ))}
          </section>
        ))}
      </main>
    </>
  )
}
