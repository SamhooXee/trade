import { describe, it, expect } from 'vitest'
import {
  computeEquityFromPortfolio,
  snapshotKey,
  toDbEquitySnapshotRow,
  fromDbEquitySnapshotRow,
} from './equity-snapshot'

describe('snapshotKey', () => {
  it('produces stable key for portfolio + date', () => {
    expect(snapshotKey('p1', '2026-09-15')).toBe('p1|2026-09-15')
  })
})

describe('computeEquityFromPortfolio', () => {
  it('returns cash when no positions', () => {
    const e = computeEquityFromPortfolio({
      cash: 1_000_000,
      positions: [],
      lastCloseBySymbol: new Map(),
    })
    expect(e).toBe(1_000_000)
  })

  it('sums cash + shares × lastClose', () => {
    const e = computeEquityFromPortfolio({
      cash: 500_000,
      positions: [
        { symbolCode: '600000', shares: 1000 },
        { symbolCode: '600001', shares: 2000 },
      ],
      lastCloseBySymbol: new Map([
        ['600000', 10],
        ['600001', 20],
      ]),
    })
    // 500_000 + 1000×10 + 2000×20 = 500_000 + 10_000 + 40_000 = 550_000
    expect(e).toBe(550_000)
  })

  it('skips positions missing lastClose (defensive, treats as 0)', () => {
    const e = computeEquityFromPortfolio({
      cash: 100_000,
      positions: [{ symbolCode: '600000', shares: 1000 }],
      lastCloseBySymbol: new Map(), // 没 close
    })
    expect(e).toBe(100_000)
  })
})

describe('snapshot row converters', () => {
  it('toDb converts camelCase → snake_case', () => {
    expect(toDbEquitySnapshotRow({
      userId: 'u1',
      portfolioId: 'p1',
      tradeDate: '2026-09-15',
      equity: 1_000_000,
      cash: 500_000,
      marketValue: 500_000,
    })).toEqual({
      user_id: 'u1',
      portfolio_id: 'p1',
      trade_date: '2026-09-15',
      equity: 1_000_000,
      cash: 500_000,
      market_value: 500_000,
    })
  })

  it('fromDb converts snake_case → camelCase and coerces NUMERIC strings', () => {
    const row = {
      id: 'snap-1',
      user_id: 'u1',
      portfolio_id: 'p1',
      trade_date: '2026-09-15',
      equity: '1000000.00',
      cash: '500000.00',
      market_value: '500000.00',
      recorded_at: '2026-09-15T15:10:00Z',
    }
    expect(fromDbEquitySnapshotRow(row)).toEqual({
      id: 'snap-1',
      userId: 'u1',
      portfolioId: 'p1',
      tradeDate: '2026-09-15',
      equity: 1_000_000,
      cash: 500_000,
      marketValue: 500_000,
      recordedAt: '2026-09-15T15:10:00Z',
    })
  })
})