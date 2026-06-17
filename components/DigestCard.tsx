import type { SignalData } from '@/types/market'

type DigestCardProps = {
  ticker: string
  score: number | null
  narrative: string | null
  signals?: SignalData | null
  size?: 'default' | 'compact'
  rank?: number
}

function scoreHeat(score: number): 'fire' | 'hot' | 'warm' | 'normal' {
  if (score >= 2000) return 'fire'
  if (score >= 500)  return 'hot'
  if (score >= 100)  return 'warm'
  return 'normal'
}

function scoreFontSize(score: number, size: 'default' | 'compact'): string {
  if (size === 'compact') return '28px'
  if (score >= 2000) return '48px'
  if (score >= 1000) return '44px'
  if (score >= 100)  return '40px'
  return '36px'
}

function heatStyles(heat: ReturnType<typeof scoreHeat>, isCompact: boolean) {
  const base = {
    padding: isCompact ? '16px 20px' : '20px 24px',
    borderRadius: 8,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }
  switch (heat) {
    case 'fire': return {
      ...base,
      background: 'linear-gradient(150deg, rgba(196,151,58,0.08) 0%, var(--surface) 45%)',
      border: '1px solid rgba(196,151,58,0.45)',
      boxShadow: '0 0 32px rgba(196,151,58,0.12), 0 0 8px rgba(196,151,58,0.06), 0 4px 16px rgba(0,0,0,0.5)',
    }
    case 'hot': return {
      ...base,
      background: 'linear-gradient(150deg, rgba(196,151,58,0.04) 0%, var(--surface) 50%)',
      border: '1px solid rgba(196,151,58,0.25)',
      boxShadow: '0 0 16px rgba(196,151,58,0.07), 0 4px 12px rgba(0,0,0,0.4)',
    }
    case 'warm': return {
      ...base,
      background: 'var(--surface)',
      border: '1px solid rgba(196,151,58,0.12)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }
    default: return {
      ...base,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }
  }
}

function scoreGlowStyle(heat: ReturnType<typeof scoreHeat>, fontSize: string) {
  const base = {
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    fontWeight: 700,
    color: 'var(--amber)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    fontSize,
    lineHeight: 1,
  }
  switch (heat) {
    case 'fire': return {
      ...base,
      textShadow: '0 0 48px rgba(196,151,58,0.6), 0 0 16px rgba(196,151,58,0.3), 0 0 4px rgba(196,151,58,0.2)',
    }
    case 'hot': return {
      ...base,
      textShadow: '0 0 28px rgba(196,151,58,0.4), 0 0 10px rgba(196,151,58,0.15)',
    }
    default: return {
      ...base,
      textShadow: '0 0 20px rgba(196,151,58,0.2), 0 0 6px rgba(196,151,58,0.08)',
    }
  }
}

export function DigestCard({ ticker, score, narrative, signals, size = 'default', rank }: DigestCardProps) {
  const top = signals?.topVolOiContracts?.[0]
  const pcRatio = signals?.putCallRatio
  const ivSkew = signals?.ivSkew
  const isBearish = pcRatio != null && pcRatio > 1
  const isCompact = size === 'compact'
  const heat = score != null ? scoreHeat(score) : 'normal'
  const cardStyle = heatStyles(heat, isCompact)
  const scoreStyle = score != null ? scoreGlowStyle(heat, scoreFontSize(score, size)) : {}

  return (
    <div style={cardStyle}>
      {/* Rank badge */}
      {rank != null && rank <= 3 && (
        <div
          style={{
            position: 'absolute', top: 12, right: 14,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            color: rank === 1 ? 'var(--amber)' : 'var(--text-3)',
            fontFamily: "'Space Grotesk', system-ui",
          }}
        >
          #{rank}
        </div>
      )}

      {/* Header: score + ticker */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        {score != null && (
          <span style={scoreStyle}>
            {score >= 1000 ? score.toLocaleString('en-US', { maximumFractionDigits: 0 }) : score.toFixed(0)}
          </span>
        )}
        <div>
          <span
            className="ticker-label"
            style={{
              fontSize: isCompact ? 13 : 14,
              color: heat === 'fire' ? 'var(--text-1)' : 'var(--text-2)',
            }}
          >
            {ticker}
          </span>
          {score != null && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              unusualness
            </div>
          )}
        </div>
      </div>

      {/* Signal chips */}
      {signals && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {pcRatio != null && (
            <span className={`chip ${isBearish ? 'chip-bear' : 'chip-bull'}`}>
              P/C {pcRatio.toFixed(2)}
            </span>
          )}
          {top && (
            <span className="chip chip-amber">
              {top.optionType === 'call' ? '↑' : '↓'} ${top.strike} {top.optionType} · {
                top.volOiRatio >= 1000
                  ? top.volOiRatio.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : top.volOiRatio.toFixed(0)
              }× vol/OI
            </span>
          )}
          {ivSkew != null && (
            <span className={`chip ${ivSkew < -0.05 ? 'chip-bear' : ivSkew > 0.05 ? 'chip-bull' : 'chip-neutral'}`}>
              IV skew {ivSkew > 0 ? '+' : ''}{(ivSkew * 100).toFixed(1)}pp
            </span>
          )}
          {signals.volumeChange && Object.keys(signals.volumeChange).length > 0 && (
            <span className="chip chip-neutral">vol Δ vs yesterday</span>
          )}
        </div>
      )}

      {/* Narrative */}
      {narrative ? (
        <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-2)', margin: 0 }}>
          {narrative}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Digest not yet available — check back after 4pm ET.
        </p>
      )}
    </div>
  )
}
