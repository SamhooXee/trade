import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'
import type { Trade, EquityPoint } from './types'

function eq(equity: number[]): EquityPoint[] {
  return equity.map((e, i) => ({
    date: `2026-09-${(i + 1).toString().padStart(2, '0')}`,
    equity: e,
  }))
}

describe('computeMetrics — totalReturn', () => {
  it('positive', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 1100000, 1230000]),
      trades: [],
    })
    expect(m.totalReturn).toBeCloseTo(0.23, 4)
  })

  it('negative', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 900000, 800000]),
      trades: [],
    })
    expect(m.totalReturn).toBeCloseTo(-0.20, 4)
  })

  it('flat', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 1000000, 1000000]),
      trades: [],
    })
    expect(m.totalReturn).toBe(0)
  })
})

describe('computeMetrics — maxDrawdown', () => {
  it('peak at day 0 valley at day 2 → -25%', () => {
    // [100, 80, 60, 90]  peak=100, valley=60 → -40%
    const m = computeMetrics({
      initialCash: 100,
      equityCurve: eq([100, 80, 60, 90]),
      trades: [],
    })
    expect(m.maxDrawdown).toBeCloseTo(-0.40, 4)
  })

  it('0% for monotonic rise', () => {
    const m = computeMetrics({
      initialCash: 100,
      equityCurve: eq([100, 110, 120, 130]),
      trades: [],
    })
    expect(m.maxDrawdown).toBe(0)
  })
})

describe('computeMetrics — annualizedReturn', () => {
  it('1.5x in 252 trading days ≈ +50% annualized', () => {
    // 1.5 → (1.5)^(252/252) - 1 = 0.5
    const curve = eq(Array.from({ length: 253 }, (_, i) => 1000000 * (1 + 0.5 * (i / 252))))
    const m = computeMetrics({ initialCash: 1000000, equityCurve: curve, trades: [] })
    expect(m.annualizedReturn).toBeCloseTo(0.5, 3)
  })
})

describe('computeMetrics — winRate', () => {
  it('BUY+SELL closed round-trips with profit/loss', () => {
    // 3 笔完整交易:2 盈 1 亏
    const trades: Trade[] = [
      // 第 1 笔盈: 10 买 11 卖
      { date: '2026-09-01', symbolCode: '600000', side: 'BUY', price: 10, shares: 1000, amount: 10000, fee: 5 },
      { date: '2026-09-02', symbolCode: '600000', side: 'SELL', price: 11, shares: 1000, amount: 11000, fee: 15 },
      // 第 2 笔盈: 12 买 13 卖
      { date: '2026-09-03', symbolCode: '600001', side: 'BUY', price: 12, shares: 100, amount: 1200, fee: 5 },
      { date: '2026-09-04', symbolCode: '600001', side: 'SELL', price: 13, shares: 100, amount: 1300, fee: 6.3 },
      // 第 3 笔亏: 20 买 18 卖
      { date: '2026-09-05', symbolCode: '600002', side: 'BUY', price: 20, shares: 100, amount: 2000, fee: 5 },
      { date: '2026-09-06', symbolCode: '600002', side: 'SELL', price: 18, shares: 100, amount: 1800, fee: 6.8 },
    ]
    const m = computeMetrics({ initialCash: 1000000, equityCurve: eq([1000000, 1000000]), trades })
    expect(m.totalTrades).toBe(6)
    expect(m.winRate).toBeCloseTo(2 / 3, 4)
  })

  it('no closed trades → winRate = 0', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000]),
      trades: [],
    })
    expect(m.winRate).toBe(0)
  })
})

describe('computeMetrics — avgHoldingDays', () => {
  it('round-trip BUY→SELL days = 1, 2, 3 → avg = 2', () => {
    const trades: Trade[] = [
      { date: '2026-09-01', symbolCode: '600000', side: 'BUY', price: 10, shares: 1000, amount: 10000, fee: 5 },
      { date: '2026-09-02', symbolCode: '600000', side: 'SELL', price: 11, shares: 1000, amount: 11000, fee: 15 },
      { date: '2026-09-01', symbolCode: '600001', side: 'BUY', price: 12, shares: 100, amount: 1200, fee: 5 },
      { date: '2026-09-04', symbolCode: '600001', side: 'SELL', price: 13, shares: 100, amount: 1300, fee: 6.3 },
      { date: '2026-09-01', symbolCode: '600002', side: 'BUY', price: 20, shares: 100, amount: 2000, fee: 5 },
      { date: '2026-09-04', symbolCode: '600002', side: 'SELL', price: 18, shares: 100, amount: 1800, fee: 6.8 },
    ]
    const m = computeMetrics({ initialCash: 1000000, equityCurve: eq([1000000]), trades })
    expect(m.avgHoldingDays).toBeCloseTo((1 + 3 + 3) / 3, 4)
  })
})