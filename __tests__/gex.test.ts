import { blackScholesGamma, computeGex, timeToExpiryYears } from '@/lib/gex'
import type { ContractData } from '@/types/market'

const makeContract = (overrides: Partial<ContractData>): ContractData => ({
  symbol: 'TEST',
  expiration: new Date('2025-01-17'),
  strike: 100,
  optionType: 'call',
  volume: 100,
  openInterest: 1000,
  impliedVolatility: 0.2,
  lastPrice: 5,
  underlyingPrice: 100,
  ...overrides,
})

const asOf = new Date('2024-10-17') // T ≈ 0.25 years to Jan 17 2025

describe('blackScholesGamma', () => {
  it('returns 0 when T <= 0', () => {
    expect(blackScholesGamma(100, 100, 0, 0.2)).toBe(0)
    expect(blackScholesGamma(100, 100, -1, 0.2)).toBe(0)
  })

  it('returns 0 when sigma <= 0', () => {
    expect(blackScholesGamma(100, 100, 0.25, 0)).toBe(0)
  })

  it('computes ATM gamma correctly (S=100, K=100, T=0.25, σ=0.2)', () => {
    // d1 = (ln(1) + 0.05*0.25 + 0.5*0.04*0.25) / (0.2*0.5) ≈ 0.0175/0.1 = 0.175... adjusted
    // gamma ≈ φ(d1)/(100 * 0.2 * 0.5) ≈ 0.3927/10 ≈ 0.03927
    const gamma = blackScholesGamma(100, 100, 0.25, 0.2)
    expect(gamma).toBeCloseTo(0.0393, 3)
  })

  it('is higher for shorter-dated options (gamma scalping effect)', () => {
    const shortDated = blackScholesGamma(100, 100, 0.05, 0.2)
    const longDated = blackScholesGamma(100, 100, 1.0, 0.2)
    expect(shortDated).toBeGreaterThan(longDated)
  })
})

describe('timeToExpiryYears', () => {
  it('returns 0 for past dates', () => {
    const past = new Date('2020-01-01')
    expect(timeToExpiryYears(past, new Date('2024-01-01'))).toBe(0)
  })

  it('returns ~0.25 for 3 months out', () => {
    const future = new Date('2025-01-17')
    const result = timeToExpiryYears(future, asOf)
    expect(result).toBeCloseTo(0.25, 1)
  })
})

describe('computeGex', () => {
  it('returns positive regime when call OI dominates put OI', () => {
    const contracts = [
      makeContract({ optionType: 'call', openInterest: 2000, expiration: new Date('2025-01-17') }),
      makeContract({ optionType: 'put', openInterest: 500, expiration: new Date('2025-01-17') }),
    ]
    const result = computeGex('TEST', contracts, 100, asOf)
    expect(result.regime).toBe('positive')
    expect(result.netGex).toBeGreaterThan(0)
  })

  it('returns negative regime when put OI dominates', () => {
    const contracts = [
      makeContract({ optionType: 'call', openInterest: 500, expiration: new Date('2025-01-17') }),
      makeContract({ optionType: 'put', openInterest: 2000, expiration: new Date('2025-01-17') }),
    ]
    const result = computeGex('TEST', contracts, 100, asOf)
    expect(result.regime).toBe('negative')
    expect(result.netGex).toBeLessThan(0)
  })

  it('call wall is the strike with max call GEX', () => {
    const contracts = [
      makeContract({ strike: 100, optionType: 'call', openInterest: 1000, expiration: new Date('2025-01-17') }),
      makeContract({ strike: 110, optionType: 'call', openInterest: 3000, expiration: new Date('2025-01-17') }),
    ]
    const result = computeGex('TEST', contracts, 100, asOf)
    expect(result.callWall).toBe(110)
  })

  it('skips contracts with 0 OI or 0 IV', () => {
    const contracts = [
      makeContract({ openInterest: 0, expiration: new Date('2025-01-17') }),
      makeContract({ impliedVolatility: 0, expiration: new Date('2025-01-17') }),
      makeContract({ openInterest: 1000, impliedVolatility: 0.2, expiration: new Date('2025-01-17') }),
    ]
    const result = computeGex('TEST', contracts, 100, asOf)
    expect(result.byStrike).toHaveLength(1)
  })

  it('absGex equals sum of absolute call and put GEX values', () => {
    const contracts = [
      makeContract({ optionType: 'call', openInterest: 1000, expiration: new Date('2025-01-17') }),
      makeContract({ optionType: 'put', openInterest: 1000, expiration: new Date('2025-01-17') }),
    ]
    const result = computeGex('TEST', contracts, 100, asOf)
    const manualAbs = result.byStrike.reduce((s, x) => s + Math.abs(x.callGex) + Math.abs(x.putGex), 0)
    expect(result.absGex).toBeCloseTo(manualAbs)
  })
})
