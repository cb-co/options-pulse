'use client'

import type { CharmData, VannaData } from '@/lib/gex'

type Props = {
  charm: CharmData
  vanna: VannaData
}

function fmtFlow(v: number, decimals = 1): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtExpiry(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const card: React.CSSProperties = {
  flex: '1 1 260px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-3)',
}

export function CharmVannaPanel({ charm, vanna }: Props) {
  const charmPositive = charm.dailyDollarFlow >= 0
  const charmColor = charmPositive ? 'var(--green)' : 'var(--red)'
  const charmSentiment = charmPositive
    ? 'Net buyer pressure: OTM puts dominate; dealers cover short-stock hedges.'
    : 'Net seller pressure: OTM calls dominate; dealers unwind long-stock hedges.'

  const vannaPositive = vanna.perVolPoint >= 0
  // +vanna: vol rise → dealers buy | vol crush → dealers sell
  // -vanna: vol rise → dealers sell | vol crush → dealers buy
  const vannaCrushColor = vannaPositive ? 'var(--red)' : 'var(--green)'
  const crushScenario = vanna.perVolPoint * -5   // 5pp vol crush
  const crushLabel = crushScenario >= 0 ? `~${fmtFlow(crushScenario)} (buy)` : `~${fmtFlow(crushScenario)} (sell)`

  const showExpiryTable = charm.byExpiry.length > 1

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>

      {/* Charm card */}
      <div style={card}>
        <div style={label}>Charm pressure</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: -6 }}>
          dealer delta-hedging flow from time decay
        </div>

        <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, color: charmColor }}>
          {fmtFlow(charm.dailyDollarFlow)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)' }}>/ day</span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {charmSentiment}
        </div>

        {showExpiryTable && (
          <div style={{ marginTop: 4 }}>
            <div style={{ ...label, marginBottom: 6 }}>By expiration</div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Expiry', 'DTE', 'Flow / day'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {charm.byExpiry.map(({ expiry, flow, daysToExpiry }, i) => (
                    <tr key={expiry} style={{ borderBottom: i < charm.byExpiry.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td className="font-mono" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-2)' }}>
                        {fmtExpiry(expiry)}
                      </td>
                      <td className="font-mono" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                        {daysToExpiry}d
                      </td>
                      <td className="font-mono" style={{ padding: '6px 10px', fontSize: 11, color: flow >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fmtFlow(flow)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Vanna card */}
      <div style={card}>
        <div style={label}>Vanna pressure</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: -6 }}>
          dealer delta-hedging flow from volatility sensitivity
        </div>

        <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, color: vannaPositive ? '#F59E0B' : 'var(--cyan)' }}>
          {fmtFlow(vanna.perVolPoint)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)' }}>/ 1pp vol</span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {vannaPositive
            ? 'Vol rise → dealers buy. Vol crush → dealers sell.'
            : 'Vol crush → dealers buy. Vol rise → dealers sell.'}
        </div>

        {/* 5pp vol crush scenario */}
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'center', gap: '4px 8px', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'contents' }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>5pp crush</span>
            <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: vannaCrushColor }}>
              {crushLabel}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>10pp crush</span>
            <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: vannaCrushColor }}>
              ~{fmtFlow(vanna.perVolPoint * -10)} ({vanna.perVolPoint * -10 >= 0 ? 'buy' : 'sell'})
            </span>
          </div>
        </div>
      </div>

      {/* Shared footer */}
      <div style={{ width: '100%', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, padding: '0 2px' }}>
        Charm and vanna are theoretical approximations assuming dealer short-gamma positioning. Actual hedging flows depend on position composition, skew, and dealer identity. Educational only — not investment advice.
      </div>
    </div>
  )
}
