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
}

function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `$${v}`
}

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  return `${sign}$${abs.toFixed(0)}`
}

export function GexChart({ data, underlyingPrice, callWall, putWall, zeroGamma }: Props) {
  const lo = underlyingPrice * 0.8
  const hi = underlyingPrice * 1.2
  const chartData = data.filter(d => d.strike >= lo && d.strike <= hi)

  // ZG and CW overlap when within 1.5% of spot — push ZG label to bottom
  const cwZgOverlap = callWall != null && zeroGamma != null
    && Math.abs(callWall - zeroGamma) < underlyingPrice * 0.015

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData} margin={{ top: 36, right: 20, bottom: 8, left: 12 }}>
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
          tickCount={9}
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

        {/* Spot — solid cyan, full-value label to the right */}
        <ReferenceLine
          x={underlyingPrice}
          stroke="#22D3EE"
          strokeWidth={1.5}
          label={{
            value: `Spot $${underlyingPrice.toFixed(2)}`,
            fill: '#22D3EE',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            position: 'insideTopRight',
          }}
        />

        {/* Put Wall — label to the right of line */}
        {putWall != null && (
          <ReferenceLine
            x={putWall}
            stroke="#F0556A"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            strokeOpacity={0.75}
            label={{
              value: `PW $${putWall}`,
              fill: '#F0556A',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              position: 'insideTopRight',
            }}
          />
        )}

        {/* Call Wall — label to the left of line */}
        {callWall != null && (
          <ReferenceLine
            x={callWall}
            stroke="#10D9A0"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            strokeOpacity={0.75}
            label={{
              value: `CW $${callWall}`,
              fill: '#10D9A0',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              position: 'insideTopLeft',
            }}
          />
        )}

        {/* Zero Gamma — top or bottom depending on CW proximity */}
        {zeroGamma != null && (
          <ReferenceLine
            x={zeroGamma}
            stroke="#71717A"
            strokeDasharray="6 3"
            strokeWidth={1}
            strokeOpacity={0.65}
            label={{
              value: `ZG $${Number(zeroGamma).toFixed(1)}`,
              fill: '#71717A',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              position: cwZgOverlap ? 'insideBottomLeft' : 'insideTopLeft',
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
