import { runDailyPipeline } from '@/lib/pipeline'

jest.mock('@/lib/marketData', () => ({ getOptionChain: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

import { getOptionChain } from '@/lib/marketData'
import { createAdminClient } from '@/lib/supabase/admin'

const mockGetOptionChain = getOptionChain as jest.Mock
const mockCreateAdminClient = createAdminClient as jest.Mock

const mockChain = {
  ticker: 'AAPL',
  underlyingPrice: 180,
  contracts: [
    {
      symbol: 'AAPL250117C00180000',
      expiration: new Date('2025-01-17'),
      strike: 180,
      optionType: 'call' as const,
      volume: 500,
      openInterest: 2000,
      impliedVolatility: 0.35,
      lastPrice: 4,
      underlyingPrice: 180,
    },
    {
      symbol: 'AAPL250117P00180000',
      expiration: new Date('2025-01-17'),
      strike: 180,
      optionType: 'put' as const,
      volume: 300,
      openInterest: 1500,
      impliedVolatility: 0.4,
      lastPrice: 5,
      underlyingPrice: 180,
    },
  ],
}

function makeMockSupabase({ watchlistTickers = [] as string[] } = {}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null })
  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table === 'watchlist_items') {
      return {
        select: jest.fn().mockResolvedValue({
          data: watchlistTickers.map(t => ({ ticker: t })),
          error: null,
        }),
      }
    }
    return { upsert: upsertMock }
  })
  return { from: fromMock, upsertMock }
}

describe('runDailyPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('processes fixed universe tickers and stores gex_snapshots', async () => {
    const { from, upsertMock } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-10-17'))

    expect(result.processed.length).toBeGreaterThan(0)
    expect(result.failed).toHaveLength(0)
    expect(upsertMock).toHaveBeenCalled()
  })

  it('includes watchlist tickers not in fixed universe', async () => {
    const { from } = makeMockSupabase({ watchlistTickers: ['GME'] })
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain.mockResolvedValue({ ...mockChain, ticker: 'GME' })

    const result = await runDailyPipeline(new Date('2024-10-17'))

    expect(result.processed).toContain('GME')
  })

  it('skips failed tickers without aborting', async () => {
    const { from } = makeMockSupabase()
    mockCreateAdminClient.mockReturnValue({ from })
    mockGetOptionChain
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(mockChain)

    const result = await runDailyPipeline(new Date('2024-10-17'))

    expect(result.failed.length).toBeGreaterThan(0)
    expect(result.processed.length).toBeGreaterThan(0)
  })
})
