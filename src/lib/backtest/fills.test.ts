import { describe, it, expect } from 'vitest'
import { matchFill, computeFee, DEFAULT_FEE_CONFIG, LIMIT_PCT } from './fills'
import type { FillRequest } from './types'
import type { DailyBar } from '@/lib/data'

function mkBar(date: string, open: number, prevClose: number, volume = 1_000_000): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open,
    high: Math.max(open, prevClose),
    low: Math.min(open, prevClose),
    // 约定:close = prevClose,供 fills.ts 做涨跌停判定
    close: prevClose,
    volume,
    amount: open * volume,
  }
}

describe('LIMIT_PCT', () => {
  it('is 10% for mainboard', () => {
    expect(LIMIT_PCT).toBe(0.10)
  })
})

describe('computeFee', () => {
  it('BUY commission is max(min, amount × rate)', () => {
    // 1000 股 × 10 元 = 10000,佣金 = max(5, 10000×0.00025) = max(5, 2.5) = 5
    expect(computeFee(10000, 'BUY', DEFAULT_FEE_CONFIG)).toBeCloseTo(5, 2)
    // 10000 股 × 10 元 = 100000,佣金 = 100000 × 0.00025 = 25
    expect(computeFee(100000, 'BUY', DEFAULT_FEE_CONFIG)).toBeCloseTo(25, 2)
  })

  it('SELL adds stamp tax = amount × 0.001', () => {
    // 佣金 25 + 印花税 100 = 125
    expect(computeFee(100000, 'SELL', DEFAULT_FEE_CONFIG)).toBeCloseTo(125, 2)
  })
})

describe('matchFill — BUY', () => {
  it('fills at next bar open when not at limit-up', () => {
    const prevClose = 10
    const nextBar = mkBar('2026-09-16', 10.5, prevClose)
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 10500 },
      nextBar,
      availableCash: 20000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    // 10500 / 10.5 = 1000 股 (整手)
    expect(r.trade?.shares).toBe(1000)
    expect(r.trade?.price).toBe(10.5)
    expect(r.trade?.amount).toBeCloseTo(10500, 2)
  })

  it('rounds shares down to lot of 100', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 2500 }, // 2500/10 = 250 → 200
      nextBar: mkBar('2026-09-16', 10, 10),
      availableCash: 5000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    expect(r.trade?.shares).toBe(200)
    expect(r.trade?.amount).toBeCloseTo(2000, 2)
  })

  it('rejects when open at limit-up (prevClose × 1.10)', () => {
    // prevClose 10 → limit-up 11.00,next bar open = 11
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 11000 },
      nextBar: mkBar('2026-09-16', 11, 10),
      availableCash: 20000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/limit/i)
  })

  it('rejects when intended shares round to 0', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 50 }, // 50/10 = 5 股 < 100
      nextBar: mkBar('2026-09-16', 10, 10),
      availableCash: 5000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/lot/i)
  })
})

describe('matchFill — SELL', () => {
  it('fills at next bar open when not at limit-down', () => {
    const prevClose = 10
    const nextBar = mkBar('2026-09-16', 9.5, prevClose)
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 9500 },
      nextBar,
      availableShares: 1000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    expect(r.trade?.shares).toBe(1000)
    expect(r.trade?.price).toBe(9.5)
  })

  it('rejects when open at limit-down (prevClose × 0.90)', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 9000 },
      nextBar: mkBar('2026-09-16', 9, 10),
      availableShares: 1000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/limit/i)
  })

  it('rejects when availableShares < 100', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 5000 },
      nextBar: mkBar('2026-09-16', 10, 10),
      availableShares: 50,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
  })

  it('caps shares to available when target exceeds', () => {
    // availableShares 1500,target = 200 股 × 10 = 20000 → shares 2000 (超 1500) → 调整为 1500
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 20000 },
      nextBar: mkBar('2026-09-16', 10, 10),
      availableShares: 1500,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    expect(r.trade?.shares).toBe(1500)
    expect(r.trade?.amount).toBeCloseTo(15000, 2)
  })
})

describe('matchFill — BUY insufficient cash', () => {
  it('rejects when shares × open > available cash', () => {
    // 1000 股 × 10 元 = 10000,但 cash = 5000
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 10000 },
      nextBar: mkBar('2026-09-16', 10, 10),
      availableCash: 5000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/cash/i)
  })
})