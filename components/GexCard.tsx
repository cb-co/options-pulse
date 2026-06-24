import Link from 'next/link'
import { RegimeBadge } from '@/components/RegimeBadge'

type Props = {
  ticker: string
  regime: 'positive' | 'negative' | null
  netGex: number | null
  callWall: number | null
  putWall: number | null
  underlyingPrice: number | null
}

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${abs.toFixed(0)}`
}

export function GexCard({ ticker, regime, netGex, callWall, putWall, underlyingPrice }: Props) {
  const borderColor = regime === 'positive'
    ? 'rgba(16,217,160,0.25)'
    : regime === 'negative'
    ? 'rgba(240,85,106,0.25)'
    : 'var(--border)'

  return (
    <Link href={`/gex/${ticker}`} style={{ textDecoration: 'none' }}>
      <div
        className="gex-card"
        style={{
          padding: '18px 20px',
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span
            className="font-display"
            style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-1)' }}
          >
            {ticker}
          </span>
          {regime && <RegimeBadge regime={regime} size="sm" />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Net GEX</div>
            <div
              className="font-mono"
              style={{
                fontSize: 13, fontWeight: 600,
                color: netGex == null ? 'var(--text-3)' : netGex >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {netGex != null ? fmtGex(netGex) : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Call Wall</div>
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
              {callWall != null ? `$${callWall}` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Put Wall</div>
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
              {putWall != null ? `$${putWall}` : '--'}
            </div>
          </div>
        </div>

        {underlyingPrice != null && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
            <span className="font-mono">Spot ${underlyingPrice.toFixed(2)}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
