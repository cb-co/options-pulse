import { ContractData, SignalData } from '@/types/market'
import {
  computePutCallRatio,
  computeTopVolOiContracts,
  computeIvSkew,
  computeUnusualnesScore,
  computeSignals,
} from '@/lib/signals'

const makeContract = (overrides: Partial<ContractData> = {}): ContractData => ({
  symbol: 'TEST240119C00150000',
  expiration: new Date('2024-01-19'),
  strike: 150,
  optionType: 'call',
  volume: 100,
  openInterest: 1000,
  impliedVolatility: 0.3,
  lastPrice: 5,
  underlyingPrice: 148,
  ...overrides,
})

describe('computePutCallRatio', () => {
  it('divides total put volume by total call volume', () => {
    const contracts = [
      makeContract({ optionType: 'call', volume: 200 }),
      makeContract({ optionType: 'put', volume: 100 }),
    ]
    expect(computePutCallRatio(contracts)).toBeCloseTo(0.5)
  })

  it('returns null when there is no call volume', () => {
    expect(computePutCallRatio([makeContract({ optionType: 'put', volume: 100 })])).toBeNull()
  })

  it('treats null volume as 0', () => {
    const contracts = [
      makeContract({ optionType: 'call', volume: null }),
      makeContract({ optionType: 'put', volume: 100 }),
    ]
    expect(computePutCallRatio(contracts)).toBeNull()
  })
})

describe('computeTopVolOiContracts', () => {
  it('returns top N contracts sorted by vol/OI ratio descending', () => {
    const contracts = [
      makeContract({ symbol: 'A', volume: 10, openInterest: 100 }),   // 0.1
      makeContract({ symbol: 'B', volume: 200, openInterest: 100 }),  // 2.0
      makeContract({ symbol: 'C', volume: 50, openInterest: 100 }),   // 0.5
      makeContract({ symbol: 'D', volume: 30, openInterest: 100 }),   // 0.3
    ]
    const result = computeTopVolOiContracts(contracts, 3)
    expect(result.map(r => r.symbol)).toEqual(['B', 'C', 'D'])
  })

  it('uses 1 as minimum OI to avoid division by zero', () => {
    const contracts = [makeContract({ volume: 500, openInterest: 0 })]
    const result = computeTopVolOiContracts(contracts)
    expect(result[0].volOiRatio).toBe(500)
  })
})

describe('computeIvSkew', () => {
  it('returns avg OTM call IV minus avg OTM put IV', () => {
    const contracts = [
      makeContract({ optionType: 'call', strike: 160, impliedVolatility: 0.4, underlyingPrice: 150 }),
      makeContract({ optionType: 'put', strike: 140, impliedVolatility: 0.3, underlyingPrice: 150 }),
    ]
    expect(computeIvSkew(contracts, 150)).toBeCloseTo(0.1)
  })

  it('returns null when no OTM options within range', () => {
    const contracts = [makeContract({ optionType: 'call', strike: 300, underlyingPrice: 150 })]
    expect(computeIvSkew(contracts, 150)).toBeNull()
  })
})

describe('computeUnusualnesScore', () => {
  it('sums volOI, put/call deviation, and IV change contributions', () => {
    const signals: SignalData = {
      putCallRatio: 0.7,
      topVolOiContracts: [{ symbol: 'A', strike: 150, optionType: 'call', volOiRatio: 2.0 }],
      ivSkew: null,
      ivChange: { A: 0.1 },
    }
    // 2.0 + |0.7-0.7|*2 + 0.1*5 = 2.5
    expect(computeUnusualnesScore(signals)).toBeCloseTo(2.5)
  })

  it('skips IV change contribution when no prior-day data', () => {
    const signals: SignalData = {
      putCallRatio: 1.2,
      topVolOiContracts: [{ symbol: 'A', strike: 150, optionType: 'call', volOiRatio: 1.0 }],
      ivSkew: null,
    }
    // 1.0 + |1.2-0.7|*2 = 1.0 + 1.0 = 2.0
    expect(computeUnusualnesScore(signals)).toBeCloseTo(2.0)
  })
})

describe('computeSignals day-2 fields', () => {
  it('computes volume, OI, and IV changes vs previous day', () => {
    const prev = [makeContract({ symbol: 'X', volume: 100, openInterest: 500, impliedVolatility: 0.3 })]
    const curr = [makeContract({ symbol: 'X', volume: 150, openInterest: 600, impliedVolatility: 0.35 })]
    const signals = computeSignals(curr, 148, prev)
    expect(signals.volumeChange?.['X']).toBeCloseTo(0.5)
    expect(signals.oiChange?.['X']).toBeCloseTo(0.2)
    expect(signals.ivChange?.['X']).toBeCloseTo(0.05)
  })

  it('omits day-2 fields when no previous data is supplied', () => {
    const curr = [makeContract()]
    const signals = computeSignals(curr, 148)
    expect(signals.volumeChange).toBeUndefined()
    expect(signals.oiChange).toBeUndefined()
    expect(signals.ivChange).toBeUndefined()
  })
})
