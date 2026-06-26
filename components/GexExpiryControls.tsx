'use client'

import { useState, useMemo } from 'react'
import {
  computeGex,
  computeGexByExpiry,
  computeVolTrigger,
  computeWallGeometry,
  computeGexBalance,
  computeCharm,
  computeVanna,
  getDistinctExpirations,
  filterContractsByExpirations,
} from '@/lib/gex'
import { runSignalEngine, LEVERAGED_ETFS } from '@/lib/gexSignals'
import { SignalsSection } from '@/components/SignalsSection'
import type { GexByExpiry, SerializedContractData } from '@/types/market'
import type { GexHistoryContext, GexHistorySnapshot } from '@/lib/gexHistory'
import { GexChart } from '@/components/GexChart'
import { GexTrendChart } from '@/components/GexTrendChart'
import { RegimePanel } from '@/components/RegimePanel'
import { CharmVannaPanel } from '@/components/CharmVannaPanel'

type Props = {
  ticker: string
  snapshotDate: string
  snapshotTs: string        // ISO timestamp of the actual cron run — used as asOf
  serializedContracts: SerializedContractData[]
  underlyingPrice: number
  initialRegime: 'positive' | 'negative'
  historySnapshots: GexHistorySnapshot[]
  historyContext: GexHistoryContext | null
}

const BAND_LABEL: Record<string, string> = {
  depressed: 'depressed',
  'below-normal': 'below normal',
  normal: 'normal',
  elevated: 'elevated',
  extreme: 'extreme',
}

const BAND_COLOR: Record<string, string> = {
  depressed: 'var(--red)',
  'below-normal': 'var(--text-2)',
  normal: 'var(--text-2)',
  elevated: 'var(--green)',
  extreme: 'var(--green)',
}

const EXPIRY_OPTIONS = [1, 2, 4, 6] as const

function fmtGex(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(3)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

function fmtExpiry(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((Math.abs(part) / Math.abs(total)) * 100)}%`
}

export function GexExpiryControls({
  ticker,
  snapshotDate,
  snapshotTs,
  serializedContracts,
  underlyingPrice,
  initialRegime,
  historySnapshots,
  historyContext,
}: Props) {
  const [nExpiries, setNExpiries] = useState<1 | 2 | 4 | 6>(4)
  const [zeroDteOnly, setZeroDteOnly] = useState(false)

  const allContracts = useMemo(
    () => serializedContracts.map(c => ({
      ...c,
      // Use 20:00 UTC (4 pm ET) as expiration time — equity options expire at market close,
      // not midnight. This lets intraday snapshots correctly compute T > 0 for same-day options.
      expiration: new Date(c.expiration + 'T20:00:00Z'),
    })),
    [serializedContracts]
  )

  // Use the actual cron timestamp rather than a hardcoded 9 pm UTC.
  // When the cron runs intraday (e.g. a manual run at 11 am ET), same-day 0DTE
  // options still have T > 0 and should produce real GEX.
  const asOf = useMemo(() => new Date(snapshotTs), [snapshotTs])

  const allExpirations = useMemo(() => getDistinctExpirations(allContracts), [allContracts])

  // Drop expirations strictly before snapshotDate (e.g. yesterday's contracts still
  // lingering in Yahoo's chain). Same-day (0DTE) expirations are kept so the 0DTE
  // toggle and breakdown row work; their T = 0 at asOf means they contribute $0 GEX,
  // which is correct after market close.
  const validExpirations = useMemo(
    () => allExpirations.filter(d => d.toISOString().split('T')[0] >= snapshotDate),
    [allExpirations, snapshotDate]
  )

  const hasZeroDte = useMemo(
    () => validExpirations.some(d => d.toISOString().split('T')[0] === snapshotDate),
    [validExpirations, snapshotDate]
  )

  const selectedContracts = useMemo(() => {
    if (zeroDteOnly) {
      return allContracts.filter(c => c.expiration.toISOString().split('T')[0] === snapshotDate)
    }
    const expirations = validExpirations.slice(0, nExpiries)
    return filterContractsByExpirations(allContracts, expirations)
  }, [allContracts, validExpirations, nExpiries, zeroDteOnly, snapshotDate])

  const gexData = useMemo(
    () => computeGex(ticker, selectedContracts, underlyingPrice, asOf),
    [ticker, selectedContracts, underlyingPrice, asOf]
  )

  const volTrigger = useMemo(
    () => computeVolTrigger(gexData.byStrike, underlyingPrice),
    [gexData.byStrike, underlyingPrice]
  )

  const expiryBreakdown: GexByExpiry[] = useMemo(() => {
    if (zeroDteOnly || allContracts.length === 0) return []
    const expirations = validExpirations.slice(0, nExpiries)
    const filtered = filterContractsByExpirations(allContracts, expirations)
    return computeGexByExpiry(ticker, filtered, underlyingPrice, asOf)
  }, [ticker, allContracts, validExpirations, nExpiries, zeroDteOnly, underlyingPrice, asOf])

  const charmData = useMemo(
    () => computeCharm(selectedContracts, underlyingPrice, asOf),
    [selectedContracts, underlyingPrice, asOf]
  )

  const vannaData = useMemo(
    () => computeVanna(selectedContracts, underlyingPrice, asOf),
    [selectedContracts, underlyingPrice, asOf]
  )

  const signalOutput = useMemo(
    () => runSignalEngine({
      ticker,
      spot: underlyingPrice,
      netGex: gexData.netGex,
      absGex: gexData.absGex,
      callWall: gexData.callWall,
      putWall: gexData.putWall,
      zeroGamma: gexData.zeroGamma,
      volTrigger,
      gexRegime: gexData.regime,
      wallGeometry: computeWallGeometry(gexData.callWall, gexData.putWall, underlyingPrice),
      gexBalance: computeGexBalance(gexData.netGex, gexData.absGex),
      historyContext: historyContext ?? null,
      snapshotTs,
      isLeveraged: LEVERAGED_ETFS.has(ticker),
    }),
    [ticker, underlyingPrice, gexData, volTrigger, historyContext, snapshotTs]
  )

  const stats = [
    {
      label: 'Net GEX',
      value: fmtGex(gexData.netGex),
      color: gexData.netGex >= 0 ? 'var(--green)' : 'var(--red)',
    },
    {
      label: 'Abs GEX',
      value: fmtGex(Math.abs(gexData.absGex)),
      color: 'var(--text-1)',
    },
    {
      label: 'Spot',
      value: `$${underlyingPrice.toFixed(2)}`,
      color: 'var(--cyan)',
    },
    {
      label: 'Call Wall',
      value: gexData.callWall != null ? `$${gexData.callWall}` : '--',
      color: 'var(--green)',
    },
    {
      label: 'Put Wall',
      value: gexData.putWall != null ? `$${gexData.putWall}` : '--',
      color: 'var(--red)',
    },
    {
      label: 'Zero Gamma',
      value: gexData.zeroGamma != null ? `$${Number(gexData.zeroGamma).toFixed(1)}` : '--',
      color: 'var(--text-2)',
    },
  ]

  const selectedExpiryLabels = zeroDteOnly
    ? (hasZeroDte ? [`${snapshotDate} (0DTE)`] : [])
    : validExpirations.slice(0, nExpiries).map(d => fmtExpiry(d.toISOString().split('T')[0]))

  return (
    <>
      {/* Expiry controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', flexShrink: 0 }}>
          Expiry window
        </span>

        {/* N expiry selector */}
        <div
          role="radiogroup"
          aria-label="Number of expirations"
          style={{ display: 'flex', gap: 2 }}
        >
          {EXPIRY_OPTIONS.map(n => (
            <button
              key={n}
              role="radio"
              aria-checked={!zeroDteOnly && nExpiries === n}
              disabled={zeroDteOnly}
              onClick={() => { setZeroDteOnly(false); setNExpiries(n) }}
              style={{
                padding: '5px 11px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                background: (!zeroDteOnly && nExpiries === n) ? 'var(--cyan)' : 'transparent',
                color: (!zeroDteOnly && nExpiries === n) ? '#000' : zeroDteOnly ? 'var(--text-3)' : 'var(--text-2)',
                border: '1px solid',
                borderColor: (!zeroDteOnly && nExpiries === n) ? 'var(--cyan)' : 'var(--border)',
                borderRadius: 4,
                cursor: zeroDteOnly ? 'not-allowed' : 'pointer',
                transition: 'background 0.1s, color 0.1s, border-color 0.1s',
                outline: 'none',
              }}
              onFocus={e => { if (!zeroDteOnly) (e.currentTarget.style.boxShadow = '0 0 0 2px var(--cyan)') }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* 0DTE toggle */}
        <button
          role="switch"
          aria-checked={zeroDteOnly}
          aria-label="Show 0DTE contracts only"
          disabled={!hasZeroDte}
          onClick={() => setZeroDteOnly(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            background: zeroDteOnly ? 'rgba(240,85,106,0.15)' : 'transparent',
            color: !hasZeroDte ? 'var(--text-3)' : zeroDteOnly ? '#F0556A' : 'var(--text-2)',
            border: '1px solid',
            borderColor: zeroDteOnly ? '#F0556A' : 'var(--border)',
            borderRadius: 4,
            cursor: !hasZeroDte ? 'not-allowed' : 'pointer',
            transition: 'background 0.1s, color 0.1s, border-color 0.1s',
            outline: 'none',
          }}
          onFocus={e => { if (hasZeroDte) (e.currentTarget.style.boxShadow = '0 0 0 2px #F0556A') }}
          onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
          title={!hasZeroDte ? 'No 0DTE contracts in snapshot' : undefined}
        >
          0DTE only
        </button>

        {/* Selected range display */}
        {selectedExpiryLabels.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {selectedExpiryLabels.join(' · ')}
          </span>
        )}
        {zeroDteOnly && !hasZeroDte && (
          <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 'auto' }}>
            No 0DTE data in this snapshot
          </span>
        )}
      </div>

      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, marginBottom: 32, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '14px 18px', background: 'var(--surface)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
            <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
            {s.label === 'Net GEX' && historyContext && (
              historyContext.sufficientHistory ? (
                <div style={{ fontSize: 10, color: BAND_COLOR[historyContext.band], marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {Math.round(historyContext.percentile)}th pct · {BAND_LABEL[historyContext.band]}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {historyContext.windowSize > 0
                    ? `building history (${historyContext.windowSize}/${20} sessions)`
                    : 'no history yet'}
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {/* Regime panel */}
      <RegimePanel gexData={gexData} spotPrice={underlyingPrice} volTrigger={volTrigger} />

      {/* Structural signal engine */}
      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <SignalsSection output={signalOutput} />
      </div>

      {zeroDteOnly && (
        <div style={{ marginTop: -16, marginBottom: 16, fontSize: 11, color: 'var(--text-3)' }}>
          0DTE profile only — toggle off to see full expiry range
        </div>
      )}

      {/* Chart */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>GEX profile</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--green)' }}>Green bars</span> = call GEX (stabilizing) &nbsp;
          <span style={{ color: 'var(--red)' }}>Red bars</span> = put GEX (destabilizing)
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 8px 12px', marginBottom: 16 }}>
        {gexData.absGex === 0 && selectedContracts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, padding: '0 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>No GEX to display</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 420 }}>
              These contracts had already expired when the snapshot was captured.
              Equity options expire at ~4 pm ET; if the snapshot was taken after
              that, T&nbsp;=&nbsp;0 in Black-Scholes and gamma is zero.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Select a later expiration or increase the expiry window.
            </div>
          </div>
        ) : (
          <GexChart
            data={gexData.byStrike}
            underlyingPrice={underlyingPrice}
            callWall={gexData.callWall}
            putWall={gexData.putWall}
            zeroGamma={gexData.zeroGamma}
            volTrigger={volTrigger}
          />
        )}
      </div>

      {/* Historical trend */}
      {historySnapshots.length >= 2 && (() => {
        // Chart needs ASC order; historySnapshots are DESC from the query
        const chartSnaps = [...historySnapshots].reverse()
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>
                Net GEX history
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                trailing {historySnapshots.length} sessions · canonical 6-exp full profile · EOD
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 8px 8px' }}>
              <GexTrendChart snapshots={chartSnaps} />
            </div>
            {!historyContext?.sufficientHistory && historySnapshots.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Own-history percentile will appear after {20} sessions of data accumulate. Snapshots build forward from initial deployment — EOD OI history cannot be reconstructed retroactively.
              </div>
            )}
          </div>
        )
      })()}

      {/* Supplementary chips */}
      {(gexData.putCallRatio != null || gexData.ivSkew != null) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
          {gexData.putCallRatio != null && (
            <span className={`chip ${gexData.putCallRatio > 1 ? 'chip-negative' : 'chip-positive'}`}>
              P/C {gexData.putCallRatio.toFixed(2)}
            </span>
          )}
          {gexData.ivSkew != null && (
            <span className={`chip ${gexData.ivSkew < -0.05 ? 'chip-negative' : gexData.ivSkew > 0.05 ? 'chip-positive' : 'chip-neutral'}`}>
              IV skew {gexData.ivSkew > 0 ? '+' : ''}{(gexData.ivSkew * 100).toFixed(1)}pp
            </span>
          )}
        </div>
      )}

      {/* Per-expiry breakdown — visible when >1 expiry selected */}
      {expiryBreakdown.length > 1 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>
            Expiry breakdown
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
            Structural / educational — shows which expirations drive the aggregate levels
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Expiry', 'Net GEX', '% of Abs', 'Call Wall', 'Put Wall'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiryBreakdown.map(({ expiry, gex }, i) => (
                  <tr key={expiry} style={{ borderBottom: i < expiryBreakdown.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td className="font-mono" style={{ padding: '10px 14px', fontSize: 12, color: expiry === snapshotDate ? '#F0556A' : 'var(--text-2)' }}>
                      {fmtExpiry(expiry)}{expiry === snapshotDate ? ' 0DTE' : ''}
                    </td>
                    <td className="font-mono" style={{ padding: '10px 14px', fontSize: 12, color: gex.netGex >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtGex(gex.netGex)}
                    </td>
                    <td className="font-mono" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>
                      {pct(gex.absGex, gexData.absGex)}
                    </td>
                    <td className="font-mono" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--green)' }}>
                      {gex.callWall != null ? `$${gex.callWall}` : '--'}
                    </td>
                    <td className="font-mono" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--red)' }}>
                      {gex.putWall != null ? `$${gex.putWall}` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charm & Vanna panel */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 10 }}>
          Second-order Greeks
        </div>
        <CharmVannaPanel charm={charmData} vanna={vannaData} />
      </div>

      {/* Strike table */}
      {gexData.byStrike.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: 12 }}>Strike breakdown</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
              {['Strike', 'Call GEX', 'Put GEX', 'Net GEX'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</div>
              ))}
            </div>
            {gexData.byStrike
              .filter(s => s.strike >= underlyingPrice * 0.85 && s.strike <= underlyingPrice * 1.15)
              .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
              .slice(0, 20)
              .map((s, i) => (
                <div key={s.strike} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', padding: '10px 16px', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: i < 19 ? '1px solid var(--border)' : 'none' }}>
                  <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>${s.strike}</div>
                  <div className="font-mono" style={{ fontSize: 12, color: 'var(--green)' }}>{fmtGex(s.callGex)}</div>
                  <div className="font-mono" style={{ fontSize: 12, color: 'var(--red)' }}>{fmtGex(s.putGex)}</div>
                  <div className="font-mono" style={{ fontSize: 12, color: s.netGex >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtGex(s.netGex)}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  )
}
