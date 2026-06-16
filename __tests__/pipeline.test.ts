import { runDailyPipeline } from '@/lib/pipeline'

jest.mock('@/lib/marketData', () => ({ getOptionChain: jest.fn() }))
jest.mock('@/lib/ai', () => ({ generateNarrative: jest.fn().mockResolvedValue('Test narrative.') }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

import { getOptionChain } from '@/lib/marketData'
import { createAdminClient } from '@/lib/supabase/admin'

const mockGetOptionChain = getOptionChain as jest.Mock
const mockCreateAdminClient = createAdminClient as jest.Mock

const mockChain = {
  ticker: 'AAPL',
  underlyingPrice: 180,
  contracts: [
    { symbol: 'AAPL240119C00180000', expiration: new Date('2024-01-19'), strike: 180, optionType: 'call', volume: 500, openInterest: 2000, impliedVolatility: 0.35, lastPrice: 4, underlyingPrice: 180 },
    { symbol: 'AAPL240119P00180000', expiration: new Date('2024-01-19'), strike: 180, optionType: 'put', volume: 300, openInterest: 1500, impliedVolatility: 0.4, lastPrice: 5, underlyingPrice: 180 },
  ],
}

function makeMockSupabase({ watchlistTickers = [] as string[], prevSnapshots = [] as unknown[] } = {}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null })
  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table === 'watchlist_items') {
      return { select: jest.fn().mockResolvedValue({ data: watchlistTickers.map(t => ({ ticker: t })), error: null }) }
    }
    if (table === 'option_snapshots') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: prevSnapshots, error: null }),
        upsert: upsertMock,
      }
    }
    return { upsert: upsertMock, select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
  })
  return { from: fromMock, upsertMock }
}

describe('runDailyPipeline', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('processes fixed universe tickers and returns results', async () => {
    const { from } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.processed.length).toBeGreaterThan(0)
    expect(result.failed).toHaveLength(0)
  })

  it('includes watchlist tickers not in fixed universe', async () => {
    const { from } = makeMockSupabase({ watchlistTickers: ['GME'] })
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue({ ...mockChain, ticker: 'GME' })

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.processed).toContain('GME')
  })

  it('skips failed tickers gracefully without aborting the job', async () => {
    const { from } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-01-19'))

    expect(result.failed.length).toBeGreaterThan(0)
    expect(result.processed.length).toBeGreaterThan(0)
  })
})
