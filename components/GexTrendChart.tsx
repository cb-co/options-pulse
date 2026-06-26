'use client'

import {
  ComposedChart, Bar, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import type { GexHistorySnapshot } from '@/lib/gexHistory'

type Props = {
  snapshots: GexHistorySnapshot[]  // ordered date ASC
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

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function GexTrendChart({ snapshots }: Props) {
  if (snapshots.length === 0) return null

  const chartData = snapshots.map(s => ({
    date: s.snapshot_date,
    net_gex: s.net_gex,
  }))

  // Only label every Nth date to avoid crowding
  const labelStep = chartData.length > 30 ? 10 : chartData.length > 15 ? 5 : 1
  const ticks = chartData
    .filter((_, i) => i === 0 || i === chartData.length - 1 || i % labelStep === 0)
    .map(d => d.date)

  const maxAbs = Math.max(...chartData.map(d => Math.abs(d.net_gex)), 1)
  const yDomain: [number, number] = [-maxAbs * 1.1, maxAbs * 1.1]

  // Accessible summary: latest value and direction
  const latest = chartData[chartData.length - 1]
  const positiveCount = chartData.filter(d => d.net_gex >= 0).length
  const negativeCount = chartData.length - positiveCount
  const summaryText = `Net GEX trend over last ${chartData.length} sessions. Latest: ${fmtGex(latest.net_gex)}. ${positiveCount} positive sessions, ${negativeCount} negative sessions.`

  return (
    <div>
      <span className="sr-only">{summaryText}</span>
      <ResponsiveContainer width="100%" height={180} aria-hidden>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(39,39,42,0.6)" vertical={false} />
          <XAxis
            dataKey="date"
            type="category"
            ticks={ticks}
            tickFormatter={fmtDate}
            tick={{ fill: '#52525B', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: '#27272A' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain}
            tickFormatter={fmtAxis}
            tick={{ fill: '#52525B', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: '#111113',
              border: '1px solid #3F3F46',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              padding: '8px 12px',
            }}
            labelStyle={{ color: '#A1A1AA', marginBottom: 4, fontSize: 11 }}
            formatter={(value: number) => [fmtGex(value), 'Net GEX']}
            labelFormatter={fmtDate}
            cursor={{ fill: 'rgba(255,255,255,0.025)', strokeWidth: 0 }}
          />

          <ReferenceLine y={0} stroke="#3F3F46" strokeWidth={1} />

          <Bar dataKey="net_gex" maxBarSize={16} opacity={0.85} isAnimationActive={false}>
            {chartData.map(entry => (
              <Cell
                key={entry.date}
                fill={entry.net_gex >= 0 ? '#10D9A0' : '#F0556A'}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
