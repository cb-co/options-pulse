export interface ContractData {
  symbol: string
  expiration: Date
  strike: number
  optionType: 'call' | 'put'
  volume: number | null
  openInterest: number | null
  impliedVolatility: number | null
  lastPrice: number | null
  underlyingPrice: number
  gamma?: number
}

export interface OptionChainData {
  ticker: string
  underlyingPrice: number
  contracts: ContractData[]
}

export interface SignalData {
  putCallRatio: number | null
  topVolOiContracts: Array<{
    symbol: string
    strike: number
    optionType: string
    volOiRatio: number
  }>
  ivSkew: number | null
  volumeChange?: Record<string, number>
  oiChange?: Record<string, number>
  ivChange?: Record<string, number>
}

export interface GexByStrike {
  strike: number
  callGex: number
  putGex: number
  netGex: number
}

export interface GexData {
  ticker: string
  underlyingPrice: number
  netGex: number
  absGex: number
  regime: 'positive' | 'negative'
  callWall: number | null
  putWall: number | null
  zeroGamma: number | null
  byStrike: GexByStrike[]
  putCallRatio: number | null
  ivSkew: number | null
}
