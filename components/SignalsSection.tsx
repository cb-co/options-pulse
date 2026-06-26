'use client'

import type { SignalEngineOutput, GexSignal } from '@/lib/gexSignals'

type Props = {
  output: SignalEngineOutput
}

function StrengthDot({ strength }: { strength: number }) {
  const filled = strength >= 3.25 ? 3 : strength >= 2.75 ? 2 : 1
  return (
    <span aria-hidden style={{ display: 'inline-flex', gap: 3, marginRight: 6 }}>
      {[1, 2, 3].map(i => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: i <= filled ? '#10D9A0' : 'var(--border)',
          }}
        />
      ))}
    </span>
  )
}

function SignalCard({ signal }: { signal: GexSignal }) {
  return (
    <li
      style={{
        padding: '14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        listStyle: 'none',
      }}
    >
      {/* Header: strength dots + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <StrengthDot strength={signal.finalStrength} />
        <span
          className="font-mono"
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}
        >
          {signal.title}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}
        >
          {signal.band}
        </span>
      </div>

      {/* Structural read */}
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px', lineHeight: 1.55 }}>
        {signal.structuralRead}
      </p>

      {/* Evidence */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {signal.evidence.map((e, i) => (
          <span
            key={i}
            className="font-mono"
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              padding: '3px 7px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 4,
              border: '1px solid var(--border)',
              width: 'fit-content',
            }}
          >
            {e}
          </span>
        ))}
      </div>
    </li>
  )
}

export function SignalsSection({ output }: Props) {
  const { signals, isStale, staleHours, structuralRegime } = output

  return (
    <section aria-labelledby="signals-heading" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <h2
          id="signals-heading"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            margin: 0,
          }}
        >
          Structural signals
        </h2>
        {isStale && (
          <span
            className="font-mono"
            style={{ fontSize: 10, color: '#F59E0B' }}
            title={`Data is ${Math.round(staleHours)}h old — signal strength capped`}
          >
            ⚠ stale data ({Math.round(staleHours)}h ago)
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {structuralRegime === 'flip-line'
            ? 'regime: flip zone'
            : `regime: ${structuralRegime}`}
        </span>
      </div>

      {signals.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          No strong structural signals right now.
        </p>
      ) : (
        <ul
          aria-label="Active structural signals"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}
        >
          {signals.map(s => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </ul>
      )}

      <p
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          margin: '8px 0 0',
          lineHeight: 1.55,
        }}
      >
        Structural / mechanical conditions derived from dealer-hedging models and EOD options data.
        Not investment advice, not sizing guidance, not a recommendation to buy or sell.
      </p>
    </section>
  )
}
