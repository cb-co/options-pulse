'use client'

import React from 'react'
import { computeWallGeometry, computeGexBalance, type WallGeometry, type GexBalance } from '@/lib/gex'
import type { GexData } from '@/types/market'

type Props = {
  gexData: GexData
  spotPrice: number
  volTrigger: number | null
}

const WALL_LABEL: Record<Exclude<WallGeometry, 'unknown'>, { short: string; sub: string }> = {
  normal:   { short: 'Normal',   sub: 'Put wall below spot, call wall above — range-bound tendency' },
  stacked:  { short: 'Stacked',  sub: 'Walls at nearly the same strike — strong pin risk into expiry' },
  inverted: { short: 'Inverted', sub: 'Call wall below put wall — squeeze structure; less stabilizing than typical positive-gamma' },
}

const BALANCE_LABEL: Record<GexBalance, { short: string; sub: string }> = {
  'one-sided': { short: 'One-sided',  sub: 'Net GEX is a large share of Abs GEX — directional book, cleaner regime signal' },
  'two-sided': { short: 'Two-sided',  sub: 'Heavy call/put offset — choppy range expected; regime signal less reliable near zero' },
  'mixed':     { short: 'Mixed',      sub: 'Moderate offset between calls and puts' },
}

type RowData = { label: string; value: string; sub?: string; valueColor: string }

export function RegimePanel({ gexData, spotPrice, volTrigger }: Props) {
  const isPositive  = gexData.regime === 'positive'
  const regimeColor = isPositive ? 'var(--green)' : 'var(--red)'

  const cushion    = gexData.zeroGamma != null ? spotPrice - gexData.zeroGamma : null
  const cushionPct = cushion != null ? (cushion / spotPrice) * 100 : null
  const isFragile  = cushionPct != null && Math.abs(cushionPct) < 1.0

  const wallGeometry = computeWallGeometry(gexData.callWall, gexData.putWall, spotPrice)
  const balance      = computeGexBalance(gexData.netGex, gexData.absGex)
  const balanceRatio = gexData.absGex !== 0 ? Math.abs(gexData.netGex) / gexData.absGex : 0

  // --- Cushion row ---
  let cushionValue: string
  let cushionColor: string
  if (cushion == null) {
    cushionValue = 'No crossing in ±15% range — regime is deep'
    cushionColor = 'var(--text-2)'
  } else if (isFragile) {
    cushionValue = `${Math.abs(cushion).toFixed(1)} pts · Within ${Math.abs(cushionPct!).toFixed(1)}% of zero gamma`
    cushionColor = '#F59E0B'
  } else if (cushion > 0) {
    cushionValue = `+${cushion.toFixed(1)} pts above zero gamma (+${cushionPct!.toFixed(1)}%)`
    cushionColor = 'var(--text-1)'
  } else {
    cushionValue = `${cushion.toFixed(1)} pts below zero gamma (${cushionPct!.toFixed(1)}%)`
    cushionColor = 'var(--text-1)'
  }
  const cushionSub = isFragile ? 'Spot riding the zero-gamma line — fragile zone' : undefined

  // --- Balance row ---
  const balanceInfo  = BALANCE_LABEL[balance]
  const balanceColor = balance === 'two-sided' ? '#F59E0B' : 'var(--text-1)'

  // --- Wall row ---
  const wallInfo  = wallGeometry !== 'unknown' ? WALL_LABEL[wallGeometry] : null
  const wallColor = wallGeometry === 'inverted' ? '#F59E0B'
    : wallGeometry === 'stacked' ? 'var(--cyan)'
    : 'var(--text-1)'

  const rows: RowData[] = [
    { label: 'Cushion',     value: cushionValue, sub: cushionSub, valueColor: cushionColor },
    { label: 'Balance',     value: `${balanceInfo.short} (${Math.round(balanceRatio * 100)}% net/abs)`, sub: balanceInfo.sub, valueColor: balanceColor },
    ...(wallInfo ? [{ label: 'Walls', value: wallInfo.short, sub: wallInfo.sub, valueColor: wallColor }] : []),
    ...(volTrigger != null ? [{
      label: 'Vol trigger',
      value: `$${volTrigger} (approx.)`,
      sub: 'Highest positive-gamma strike below spot — last gamma floor before regime gives way',
      valueColor: '#F59E0B' as string,
    }] : []),
  ]

  return (
    <div
      role="region"
      aria-label={`Regime analysis: ${gexData.regime} gamma`}
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${regimeColor}`,
        borderRadius: 8,
        padding: '16px 20px',
        background: 'var(--surface)',
        marginBottom: 24,
      }}
    >
      {/* Headline */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: regimeColor, letterSpacing: '-0.01em' }}>
          {isPositive ? '▲' : '▼'} {isPositive ? 'Positive' : 'Negative'} Gamma
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {isPositive
            ? 'Dealers stabilizing — mean-reverting pressure'
            : 'Dealers amplifying — trending pressure'}
        </span>
      </div>

      {/* Derived rows in a two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', rowGap: 8 }}>
        {rows.map(row => (
          <React.Fragment key={row.label}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-3)', paddingTop: 1,
            }}>
              {row.label}
            </span>
            <div>
              <span className="font-mono" style={{ fontSize: 12, color: row.valueColor }}>
                {row.value}
              </span>
              {row.sub && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {row.sub}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.02em' }}>
        Structural context only — educational, not investment advice
      </div>
    </div>
  )
}
