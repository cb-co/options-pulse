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
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  return String(v)
}

export function GexChart({ data, underlyingPrice, callWall, putWall, zeroGamma }: Props) {
  const lo = underlyingPrice * 0.8
  const hi = underlyingPrice * 1.2
  const chartData = data.filter(d => d.strike >= lo && d.strike <= hi)

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
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
          tick={{ fill: '#52525B', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: '#111113',
            border: '1px solid #27272A',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
          labelStyle={{ color: '#A1A1AA' }}
          formatter={(value: number, name: string) => [
            `$${fmtAxis(value)}`,
            name === 'callGex' ? 'Call GEX' : 'Put GEX',
          ]}
          labelFormatter={label => `Strike: $${label}`}
        />
        <ReferenceLine y={0} stroke="#3F3F46" strokeWidth={1} />
        <Bar dataKey="callGex" fill="#10D9A0" maxBarSize={18} opacity={0.85} />
        <Bar dataKey="putGex" fill="#F0556A" maxBarSize={18} opacity={0.85} />
        <ReferenceLine
          x={underlyingPrice}
          stroke="#22D3EE"
          strokeWidth={2}
          label={{ value: 'Spot', fill: '#22D3EE', fontSize: 10, position: 'top' }}
        />
        {callWall && (
          <ReferenceLine
            x={callWall}
            stroke="#10D9A0"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'CW', fill: '#10D9A0', fontSize: 9, position: 'top' }}
          />
        )}
        {putWall && (
          <ReferenceLine
            x={putWall}
            stroke="#F0556A"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'PW', fill: '#F0556A', fontSize: 9, position: 'top' }}
          />
        )}
        {zeroGamma && (
          <ReferenceLine
            x={zeroGamma}
            stroke="#A1A1AA"
            strokeDasharray="6 3"
            strokeWidth={1}
            label={{ value: 'ZG', fill: '#A1A1AA', fontSize: 9, position: 'top' }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
