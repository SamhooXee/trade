import { describe, it, expect } from 'vitest'
import type { DailyBar, MinuteBar, Symbol } from './provider'

describe('provider types', () => {
  it('Symbol shape', () => {
    const s: Symbol = {
      code: '600000',
      market: 'SH',
      name: '浦发银行',
      listDate: '1999-11-10',
      delistDate: null,
    }
    expect(s.code).toBe('600000')
    expect(s.market).toMatch(/^(SH|SZ)$/)
  })

  it('DailyBar shape', () => {
    const b: DailyBar = {
      symbolCode: '600000',
      tradeDate: '2026-09-15',
      open: 10.5,
      high: 10.8,
      low: 10.2,
      close: 10.6,
      volume: 1_000_000,
      amount: 10_600_000,
    }
    expect(b.symbolCode).toBe('600000')
    expect(b.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(b.high).toBeGreaterThanOrEqual(b.low)
  })

  it('MinuteBar shape', () => {
    const b: MinuteBar = {
      symbolCode: '600000',
      tradeDate: '2026-09-15',
      tradeTime: '2026-09-15T01:31:00Z',
      open: 10.5,
      high: 10.8,
      low: 10.2,
      close: 10.6,
      volume: 50_000,
      amount: 530_000,
    }
    expect(b.tradeTime).toMatch(/T/)
  })
})