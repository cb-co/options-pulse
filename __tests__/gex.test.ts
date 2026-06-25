import {
  blackScholesGamma, computeGex, timeToExpiryYears,
  getDistinctExpirations, filterContractsByExpirations, computeGexByExpiry,
  computeVolTrigger, computeWallGeometry, computeGexBalance,
  computeCharm, computeVanna,
} from '@/lib/gex'
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

describe('getDistinctExpirations', () => {
  const exp1 = new Date('2025-01-17T00:00:00Z')
  const exp2 = new Date('2025-01-24T00:00:00Z')
  const exp3 = new Date('2025-02-21T00:00:00Z')

  it('returns unique expirations sorted ascending', () => {
    const contracts: ContractData[] = [
      makeContract({ expiration: exp3 }),
      makeContract({ expiration: exp1 }),
      makeContract({ expiration: exp2 }),
      makeContract({ expiration: exp1 }),  // duplicate
    ]
    const exps = getDistinctExpirations(contracts)
    expect(exps).toHaveLength(3)
    expect(exps[0].toISOString().split('T')[0]).toBe('2025-01-17')
    expect(exps[1].toISOString().split('T')[0]).toBe('2025-01-24')
    expect(exps[2].toISOString().split('T')[0]).toBe('2025-02-21')
  })

  it('returns empty array for empty contracts', () => {
    expect(getDistinctExpirations([])).toHaveLength(0)
  })
})

describe('filterContractsByExpirations', () => {
  const exp1 = new Date('2025-01-17T00:00:00Z')
  const exp2 = new Date('2025-01-24T00:00:00Z')
  const exp3 = new Date('2025-02-21T00:00:00Z')

  const contracts: ContractData[] = [
    makeContract({ expiration: exp1, openInterest: 100 }),
    makeContract({ expiration: exp2, openInterest: 200 }),
    makeContract({ expiration: exp3, openInterest: 300 }),
  ]

  it('filters to the supplied expiration dates only', () => {
    const filtered = filterContractsByExpirations(contracts, [exp1, exp2])
    expect(filtered).toHaveLength(2)
    expect(filtered.every(c => ['2025-01-17', '2025-01-24'].includes(c.expiration.toISOString().split('T')[0]))).toBe(true)
  })

  it('returns empty when no expirations match', () => {
    const filtered = filterContractsByExpirations(contracts, [new Date('2030-01-01T00:00:00Z')])
    expect(filtered).toHaveLength(0)
  })
})

describe('computeGexByExpiry — multi-expiry fixture', () => {
  // Two expirations: near (T≈0.25yr) and far (T≈0.5yr)
  // Near: Call K=100 OI=1000; Far: Put K=100 OI=2000
  // The near expiry should be positive regime; far expiry negative.
  // Together (the aggregate) depends on which gamma dominates.

  const asOf = new Date('2024-10-17')
  const nearExp = new Date('2025-01-17T00:00:00Z')   // T ≈ 0.25yr
  const farExp  = new Date('2025-04-17T00:00:00Z')    // T ≈ 0.50yr

  const contracts: ContractData[] = [
    makeContract({ expiration: nearExp, optionType: 'call', openInterest: 1000, impliedVolatility: 0.20 }),
    makeContract({ expiration: farExp,  optionType: 'put',  openInterest: 2000, impliedVolatility: 0.20 }),
  ]

  it('returns one entry per distinct expiration', () => {
    const breakdown = computeGexByExpiry('TEST', contracts, 100, asOf)
    expect(breakdown).toHaveLength(2)
    expect(breakdown[0].expiry).toBe('2025-01-17')
    expect(breakdown[1].expiry).toBe('2025-04-17')
  })

  it('near expiry slice is positive regime (call-only)', () => {
    const breakdown = computeGexByExpiry('TEST', contracts, 100, asOf)
    expect(breakdown[0].gex.regime).toBe('positive')
    expect(breakdown[0].gex.netGex).toBeGreaterThan(0)
  })

  it('far expiry slice is negative regime (put-only)', () => {
    const breakdown = computeGexByExpiry('TEST', contracts, 100, asOf)
    expect(breakdown[1].gex.regime).toBe('negative')
    expect(breakdown[1].gex.netGex).toBeLessThan(0)
  })

  it('per-expiry net GEX sum equals aggregate net GEX', () => {
    const breakdown = computeGexByExpiry('TEST', contracts, 100, asOf)
    const sumFromBreakdown = breakdown.reduce((s, b) => s + b.gex.netGex, 0)
    const aggregate = computeGex('TEST', contracts, 100, asOf)
    expect(sumFromBreakdown).toBeCloseTo(aggregate.netGex, 6)
  })

  it('N=1 slice (nearest expiry only) has positive net GEX', () => {
    const expirations = getDistinctExpirations(contracts).slice(0, 1)
    const filtered = filterContractsByExpirations(contracts, expirations)
    const r = computeGex('TEST', filtered, 100, asOf)
    expect(r.netGex).toBeGreaterThan(0)
  })
})

describe('computeVolTrigger', () => {
  const strikes = (items: Array<[number, number]>): import('@/types/market').GexByStrike[] =>
    items.map(([strike, netGex]) => ({ strike, netGex, callGex: Math.max(0, netGex), putGex: Math.min(0, netGex) }))

  it('returns highest positive-netGex strike below spot', () => {
    const byStrike = strikes([[90, 500], [95, 800], [100, 200], [105, -100], [110, 300]])
    expect(computeVolTrigger(byStrike, 103)).toBe(100)
  })

  it('skips negative-netGex strikes below spot', () => {
    const byStrike = strikes([[90, -200], [95, 100], [100, -50]])
    expect(computeVolTrigger(byStrike, 105)).toBe(95)
  })

  it('returns null when no positive-netGex strike exists below spot', () => {
    const byStrike = strikes([[90, -100], [95, -50]])
    expect(computeVolTrigger(byStrike, 100)).toBeNull()
  })

  it('returns null when all positive strikes are above spot', () => {
    const byStrike = strikes([[110, 500], [120, 800]])
    expect(computeVolTrigger(byStrike, 100)).toBeNull()
  })

  it('ignores strikes exactly at spot (must be strictly below)', () => {
    const byStrike = strikes([[100, 500], [95, 200]])
    expect(computeVolTrigger(byStrike, 100)).toBe(95)
  })
})

describe('computeWallGeometry', () => {
  it('returns normal when put wall below spot and call wall above', () => {
    expect(computeWallGeometry(110, 90, 100)).toBe('normal')
  })

  it('returns inverted when call wall is below put wall', () => {
    expect(computeWallGeometry(95, 105, 100)).toBe('inverted')
  })

  it('returns stacked when walls are within 0.5% of spot of each other', () => {
    // 0.5% of 100 = 0.5; walls at 100 and 100.3 are within threshold
    expect(computeWallGeometry(100.3, 100, 100)).toBe('stacked')
  })

  it('returns unknown when either wall is null', () => {
    expect(computeWallGeometry(null, 90, 100)).toBe('unknown')
    expect(computeWallGeometry(110, null, 100)).toBe('unknown')
  })

  it('boundary: walls at exactly 0.5% apart are stacked', () => {
    // 0.5% of 1000 = 5; walls at 1000 and 1005 → diff=5 ≤ 5 → stacked
    expect(computeWallGeometry(1005, 1000, 1000)).toBe('stacked')
  })

  it('boundary: walls just beyond 0.5% apart are not stacked', () => {
    // diff=5.1 > 5 → not stacked, 1005.1 > 1000 → normal
    expect(computeWallGeometry(1005.1, 1000, 1000)).toBe('normal')
  })
})

describe('computeGexBalance', () => {
  it('returns one-sided when |net| >= 65% of abs', () => {
    expect(computeGexBalance(700, 1000)).toBe('one-sided')
    expect(computeGexBalance(-650, 1000)).toBe('one-sided')
  })

  it('returns two-sided when |net| <= 35% of abs', () => {
    expect(computeGexBalance(100, 1000)).toBe('two-sided')
    expect(computeGexBalance(-300, 1000)).toBe('two-sided')
  })

  it('returns mixed for values between thresholds', () => {
    expect(computeGexBalance(500, 1000)).toBe('mixed')
    expect(computeGexBalance(-450, 1000)).toBe('mixed')
  })

  it('returns mixed when absGex is 0', () => {
    expect(computeGexBalance(0, 0)).toBe('mixed')
  })

  it('boundary: exactly 65% is one-sided, 64.9% is mixed', () => {
    expect(computeGexBalance(650, 1000)).toBe('one-sided')
    expect(computeGexBalance(649, 1000)).toBe('mixed')
  })

  it('boundary: exactly 35% is two-sided, 35.1% is mixed', () => {
    expect(computeGexBalance(350, 1000)).toBe('two-sided')
    expect(computeGexBalance(351, 1000)).toBe('mixed')
  })
})

describe('computeCharm', () => {
  const charmAsOf = new Date('2024-10-17')
  const charmExp  = new Date('2025-01-17T00:00:00Z')  // T ≈ 0.25yr

  it('returns zero dailyDollarFlow for empty contracts', () => {
    const result = computeCharm([], 100, charmAsOf)
    expect(result.dailyDollarFlow).toBe(0)
    expect(result.byExpiry).toHaveLength(0)
  })

  it('skips contracts with zero OI or IV', () => {
    const contracts = [
      makeContract({ openInterest: 0, expiration: charmExp }),
      makeContract({ impliedVolatility: 0, expiration: charmExp }),
    ]
    const result = computeCharm(contracts, 100, charmAsOf)
    expect(result.dailyDollarFlow).toBe(0)
  })

  it('skips expired contracts (T <= 0)', () => {
    const pastExp = new Date('2020-01-01T00:00:00Z')
    const contracts = [makeContract({ expiration: pastExp })]
    const result = computeCharm(contracts, 100, charmAsOf)
    expect(result.dailyDollarFlow).toBe(0)
  })

  it('OTM put (K<S) produces positive daily flow: dealers buy as delta decays toward 0', () => {
    // K=80 deep OTM put: charm > 0 (put delta decays from negative toward 0).
    // Dealer (short put, positive delta) covers their short stock hedge → buys → positive flow.
    const put = makeContract({ strike: 80, optionType: 'put', expiration: charmExp, openInterest: 1000, impliedVolatility: 0.2 })
    const result = computeCharm([put], 100, charmAsOf)
    expect(result.dailyDollarFlow).toBeGreaterThan(0)
  })

  it('OTM call (K>S) produces negative daily flow: dealers sell as delta decays toward 0', () => {
    // K=120 OTM call: charm < 0 (call delta decays from ~0.2 toward 0).
    // Dealer (short call, hedged long stock) unwinds long stock → sells → negative flow.
    const call = makeContract({ strike: 120, optionType: 'call', expiration: charmExp, openInterest: 1000, impliedVolatility: 0.2 })
    const result = computeCharm([call], 100, charmAsOf)
    expect(result.dailyDollarFlow).toBeLessThan(0)
  })

  it('mixed call+put flow sums components correctly', () => {
    const call = makeContract({ optionType: 'call', expiration: charmExp, openInterest: 1000, impliedVolatility: 0.2 })
    const put  = makeContract({ optionType: 'put',  expiration: charmExp, openInterest: 1000, impliedVolatility: 0.2 })
    const combined = computeCharm([call, put], 100, charmAsOf)
    const callOnly  = computeCharm([call], 100, charmAsOf)
    const putOnly   = computeCharm([put],  100, charmAsOf)
    expect(combined.dailyDollarFlow).toBeCloseTo(callOnly.dailyDollarFlow + putOnly.dailyDollarFlow, 8)
  })

  it('groups by expiry correctly: two distinct expirations produce two byExpiry entries', () => {
    const nearExp = new Date('2025-01-17T00:00:00Z')
    const farExp  = new Date('2025-04-17T00:00:00Z')
    const contracts = [
      makeContract({ expiration: nearExp, openInterest: 1000, impliedVolatility: 0.2 }),
      makeContract({ expiration: farExp,  openInterest: 1000, impliedVolatility: 0.2 }),
    ]
    const result = computeCharm(contracts, 100, charmAsOf)
    expect(result.byExpiry).toHaveLength(2)
    expect(result.byExpiry[0].expiry).toBe('2025-01-17')
    expect(result.byExpiry[1].expiry).toBe('2025-04-17')
  })

  it('byExpiry flows sum to dailyDollarFlow', () => {
    const nearExp = new Date('2025-01-17T00:00:00Z')
    const farExp  = new Date('2025-04-17T00:00:00Z')
    const contracts = [
      makeContract({ expiration: nearExp, openInterest: 1000, impliedVolatility: 0.2 }),
      makeContract({ expiration: farExp,  openInterest: 500,  impliedVolatility: 0.25 }),
    ]
    const result = computeCharm(contracts, 100, charmAsOf)
    const sumFromByExpiry = result.byExpiry.reduce((s, e) => s + e.flow, 0)
    expect(sumFromByExpiry).toBeCloseTo(result.dailyDollarFlow, 8)
  })

  it('daysToExpiry in byExpiry matches T*365 approximation', () => {
    const contracts = [makeContract({ expiration: charmExp, openInterest: 1000, impliedVolatility: 0.2 })]
    const result = computeCharm(contracts, 100, charmAsOf)
    expect(result.byExpiry[0].daysToExpiry).toBeCloseTo(92, 0)
  })
})

describe('computeVanna', () => {
  const vannaAsOf = new Date('2024-10-17')
  const vannaExp  = new Date('2025-01-17T00:00:00Z')

  it('returns zero perVolPoint for empty contracts', () => {
    const result = computeVanna([], 100, vannaAsOf)
    expect(result.perVolPoint).toBe(0)
  })

  it('skips contracts with zero OI or IV', () => {
    const contracts = [
      makeContract({ openInterest: 0, expiration: vannaExp }),
      makeContract({ impliedVolatility: 0, expiration: vannaExp }),
    ]
    const result = computeVanna(contracts, 100, vannaAsOf)
    expect(result.perVolPoint).toBe(0)
  })

  it('OTM call has positive vanna (delta increases as vol rises)', () => {
    // OTM: spot 100, strike 110 → d2 < 0 → vanna = -phi(d1)*d2/sigma > 0 for call
    const call = makeContract({ strike: 110, optionType: 'call', expiration: vannaExp, openInterest: 1000, impliedVolatility: 0.2 })
    const result = computeVanna([call], 100, vannaAsOf)
    expect(result.perVolPoint).toBeGreaterThan(0)
  })

  it('OTM put has negative vanna (dealers sell when vol rises)', () => {
    // OTM put: spot 100, strike 90 → d2 > 0 → vanna < 0 → dealer flow (short put) flipped → negative
    const put = makeContract({ strike: 90, optionType: 'put', expiration: vannaExp, openInterest: 1000, impliedVolatility: 0.2 })
    const result = computeVanna([put], 100, vannaAsOf)
    expect(result.perVolPoint).toBeLessThan(0)
  })

  it('linearly scales with OI', () => {
    const c1 = makeContract({ optionType: 'call', strike: 110, expiration: vannaExp, openInterest: 1000, impliedVolatility: 0.2 })
    const c2 = makeContract({ optionType: 'call', strike: 110, expiration: vannaExp, openInterest: 2000, impliedVolatility: 0.2 })
    const r1 = computeVanna([c1], 100, vannaAsOf)
    const r2 = computeVanna([c2], 100, vannaAsOf)
    expect(r2.perVolPoint).toBeCloseTo(r1.perVolPoint * 2, 8)
  })

  it('additivity: combined call+put equals sum of individual perVolPoints', () => {
    const call = makeContract({ optionType: 'call', strike: 105, expiration: vannaExp, openInterest: 1000, impliedVolatility: 0.2 })
    const put  = makeContract({ optionType: 'put',  strike: 95,  expiration: vannaExp, openInterest: 800,  impliedVolatility: 0.2 })
    const combined = computeVanna([call, put], 100, vannaAsOf)
    const callOnly = computeVanna([call], 100, vannaAsOf)
    const putOnly  = computeVanna([put],  100, vannaAsOf)
    expect(combined.perVolPoint).toBeCloseTo(callOnly.perVolPoint + putOnly.perVolPoint, 8)
  })
})
