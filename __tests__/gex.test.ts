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

describe('computeGex — hand-computed fixture (locks formula correctness)', () => {
  // Synthetic chain with deterministic inputs and pre-verified expected outputs.
  // asOf=2024-10-17, exp=2025-01-17 → T = 92/365 = 0.25205yr exactly. r=0.05.
  // Formula: gex = gamma × OI × 100 × S² × 0.01   (dollar gamma per 1% move)
  //
  // Contract A: Call  K=100 OI=1000 σ=0.20
  //   d1 = (ln(1) + (0.05+0.02)×0.25205) / (0.20×√0.25205) = 0.1764/0.1004 ≈ 0.1757
  //   gamma ≈ 0.039123,  callGex = 0.039123×1000×100×10000×0.01 ≈ 391,226
  //
  // Contract B: Put   K=100 OI=500  σ=0.20  (same gamma as A, stored as negative)
  //   putGex stored ≈ −195,613
  //
  // Contract C: Call  K=110 OI=2000 σ=0.22  → callGex ≈ 567,947
  //
  // K=100 netGex ≈ 391,226 − 195,613 = 195,613
  // K=110 netGex ≈ 567,947
  // Total netGex ≈ 763,560   absGex ≈ 1,154,786
  // Call wall = 110 (callGex 567,947 > 391,226)   Put wall = 100 (only put)

  const fixtureAsOf = new Date('2024-10-17')
  const fixtureExp  = new Date('2025-01-17')

  const fixtureContracts: ContractData[] = [
    makeContract({ strike: 100, optionType: 'call', openInterest: 1000, impliedVolatility: 0.20, expiration: fixtureExp }),
    makeContract({ strike: 100, optionType: 'put',  openInterest: 500,  impliedVolatility: 0.20, expiration: fixtureExp }),
    makeContract({ strike: 110, optionType: 'call', openInterest: 2000, impliedVolatility: 0.22, expiration: fixtureExp }),
  ]

  const result = computeGex('FIXTURE', fixtureContracts, 100, fixtureAsOf)

  it('netGex matches hand-computed value (~763,560)', () => {
    expect(result.netGex).toBeCloseTo(763560, 0)
  })

  it('absGex matches hand-computed value (~1,154,786)', () => {
    expect(result.absGex).toBeCloseTo(1154786, 0)
  })

  it('callWall is 110 — highest per-strike call GEX', () => {
    expect(result.callWall).toBe(110)
  })

  it('putWall is 100 — only strike with put concentration', () => {
    expect(result.putWall).toBe(100)
  })

  it('regime is positive (calls dominate)', () => {
    expect(result.regime).toBe('positive')
  })

  it('put sign convention: putGex at K=100 is negative, callGex is positive', () => {
    const k100 = result.byStrike.find(s => s.strike === 100)!
    expect(k100.callGex).toBeGreaterThan(0)
    expect(k100.putGex).toBeLessThan(0)
    // putGex magnitude should be half of callGex magnitude (OI 500 vs 1000, same gamma)
    expect(k100.putGex).toBeCloseTo(-k100.callGex / 2, 4)
  })

  it('netGex at each strike equals callGex + putGex (sign invariant)', () => {
    for (const s of result.byStrike) {
      expect(s.netGex).toBeCloseTo(s.callGex + s.putGex, 10)
    }
  })

  it('call-only chain has null zeroGamma (net GEX is always positive)', () => {
    const callsOnly: ContractData[] = [
      makeContract({ optionType: 'call', openInterest: 1000, expiration: fixtureExp }),
    ]
    const r = computeGex('CALLS_ONLY', callsOnly, 100, fixtureAsOf)
    expect(r.zeroGamma).toBeNull()
  })

  it('put-only chain has null zeroGamma (net GEX is always negative in sweep range)', () => {
    const putsOnly: ContractData[] = [
      makeContract({ optionType: 'put', openInterest: 1000, expiration: fixtureExp }),
    ]
    const r = computeGex('PUTS_ONLY', putsOnly, 100, fixtureAsOf)
    expect(r.zeroGamma).toBeNull()
  })
})
