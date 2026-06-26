'use client'

import {
  ComposedChart, Bar, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { GexByStrike } from '@/types/market'

type Props = {
  data: GexByStrike[]
  underlyingPrice: number
  callWall?: number | null
  putWall?: number | null
  zeroGamma?: number | null
  volTrigger?: number | null
}

function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

type RefLineInput = {
  x: number
  label: string
  color: string
  strokeDasharray?: string
  strokeWidth?: number
  strokeOpacity?: number
}
type RefLineResolved = RefLineInput & {
  position: 'insideTopLeft' | 'insideTopRight'
  dy: number
}

// Groups reference lines that fall within 1.2% of spot of each other into clusters,
// then stacks their labels vertically (dy offsets) so they don't overprint.
// Spot line always gets dy=0 (top of any cluster it joins).
function resolveRefLineLabels(lines: RefLineInput[], spotPrice: number): RefLineResolved[] {
  if (lines.length === 0) return []

  const CLUSTER_RANGE = spotPrice * 0.012  // 1.2% — tighter than a normal strike gap
  const DY_STEP = 14                        // px between stacked labels

  const sorted = lines.map((l, origIdx) => ({ ...l, origIdx })).sort((a, b) => a.x - b.x)
  const resolved: Array<typeof sorted[0] & { position: 'insideTopLeft' | 'insideTopRight'; dy: number }> = []

  let i = 0
  while (i < sorted.length) {
    // Collect all lines within CLUSTER_RANGE of the first in this run
    let j = i + 1
    while (j < sorted.length && sorted[j].x - sorted[i].x < CLUSTER_RANGE) j++
    const cluster = sorted.slice(i, j)

    const clusterMid = (cluster[0].x + cluster[cluster.length - 1].x) / 2
    const side: 'insideTopLeft' | 'insideTopRight' =
      clusterMid <= spotPrice ? 'insideTopRight' : 'insideTopLeft'

    // Spot always gets the dy=0 slot so it's the most readable
    const spotIdx = cluster.findIndex(l => l.label.startsWith('Spot'))
    if (spotIdx > 0) {
      const [spotLine] = cluster.splice(spotIdx, 1)
      cluster.unshift(spotLine)
    }

    cluster.forEach((l, k) => {
      resolved.push({ ...l, position: side, dy: -k * DY_STEP })
    })

    i = j
  }

  const result: RefLineResolved[] = new Array(lines.length)
  resolved.forEach(l => { result[l.origIdx] = l })
  return result
}

export function GexChart({ data, underlyingPrice, callWall, putWall, zeroGamma, volTrigger }: Props) {
  // Dynamic window: only show strikes with meaningful GEX (≥ 0.5% of peak).
  // Prevents the chart from wasting space on near-zero bars at the extremes.
  const allAbs = data.map(d => Math.abs(d.callGex) + Math.abs(d.putGex))
  const maxAbs = allAbs.length ? Math.max(...allAbs) : 0
  const active = maxAbs > 0
    ? data.filter(d => Math.abs(d.callGex) + Math.abs(d.putGex) >= maxAbs * 0.02)
    : data

  let lo: number
  let hi: number
  if (active.length >= 2) {
    const minStrike = Math.min(...active.map(d => d.strike))
    const maxStrike = Math.max(...active.map(d => d.strike))
    const spread = maxStrike - minStrike
    // Pad by 15% of active spread, but at least 4% of spot on each side
    const pad = Math.max(spread * 0.15, underlyingPrice * 0.04)
    lo = minStrike - pad
    hi = maxStrike + pad
  } else {
    lo = underlyingPrice * 0.80
    hi = underlyingPrice * 1.20
  }

  // Always keep spot visible with at least 4% breathing room on each side
  lo = Math.min(lo, underlyingPrice * 0.96)
  hi = Math.max(hi, underlyingPrice * 1.04)

  const chartData = data.filter(d => d.strike >= lo && d.strike <= hi)

  const refLevelInputs: RefLineInput[] = [
    { x: underlyingPrice, label: `Spot $${underlyingPrice.toFixed(2)}`, color: '#22D3EE', strokeWidth: 1.5 },
    ...(putWall    != null ? [{ x: putWall,    label: `PW $${putWall}`,                      color: '#F0556A', strokeDasharray: '4 3', strokeWidth: 1.5, strokeOpacity: 0.75 }] : []),
    ...(callWall   != null ? [{ x: callWall,   label: `CW $${callWall}`,                     color: '#10D9A0', strokeDasharray: '4 3', strokeWidth: 1.5, strokeOpacity: 0.75 }] : []),
    ...(zeroGamma  != null ? [{ x: zeroGamma,  label: `ZG $${Number(zeroGamma).toFixed(1)}`, color: '#71717A', strokeDasharray: '6 3', strokeWidth: 1,   strokeOpacity: 0.65 }] : []),
    ...(volTrigger != null ? [{ x: volTrigger, label: `VT $${volTrigger}`,                   color: '#F59E0B', strokeDasharray: '3 3', strokeWidth: 1,   strokeOpacity: 0.65 }] : []),
  ]

  const refLines = resolveRefLineLabels(refLevelInputs, underlyingPrice)

  return (
    <ResponsiveContainer width="100%" height={400}>
      {/* top: 56 gives stacked labels room (4 labels × 14px + breathing) */}
      <ComposedChart data={chartData} margin={{ top: 56, right: 20, bottom: 8, left: 12 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(39,39,42,0.6)" vertical={false} />
        <XAxis
          type="number"
          dataKey="strike"
          domain={[lo, hi]}
          tick={{ fill: '#52525B', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          axisLine={{ stroke: '#27272A' }}
          tickLine={false}
          tickFormatter={v => `$${v}`}
          scale="linear"
        />
        <YAxis
          tickFormatter={fmtAxis}
          tick={{ fill: '#52525B', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={{
            background: '#111113',
            border: '1px solid #3F3F46',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            padding: '10px 14px',
          }}
          labelStyle={{ color: '#A1A1AA', marginBottom: 4, fontSize: 11 }}
          itemStyle={{ padding: '2px 0' }}
          formatter={(value: number, name: string) => [
            fmtGex(value),
            name === 'callGex' ? 'Call GEX' : 'Put GEX',
          ]}
          labelFormatter={label => `Strike $${label}`}
          cursor={{ fill: 'rgba(255,255,255,0.025)', strokeWidth: 0 }}
        />

        <ReferenceLine y={0} stroke="#3F3F46" strokeWidth={1} />
        <Bar dataKey="callGex" fill="#10D9A0" maxBarSize={22} opacity={0.82} />
        <Bar dataKey="putGex" fill="#F0556A" maxBarSize={22} opacity={0.82} />

        {refLines.map(rl => (
          <ReferenceLine
            key={rl.label}
            x={rl.x}
            stroke={rl.color}
            strokeDasharray={rl.strokeDasharray}
            strokeWidth={rl.strokeWidth ?? 1}
            strokeOpacity={rl.strokeOpacity ?? 1}
            label={{
              value: rl.label,
              fill: rl.color,
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              position: rl.position,
              dy: rl.dy,
            } as React.ComponentProps<typeof ReferenceLine>['label']}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
