import type { Config } from 'jest'

// testEnvironment: 'node' is intentional — all planned tests cover server-side
// modules (signal logic, market data, AI client, pipeline). Component tests
// would need @jest-environment jsdom and jest-environment-jsdom installed.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default config
