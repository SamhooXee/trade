import { describe, it, expect } from 'vitest'
import { evaluateConditions } from './evaluate'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
      amount: close * 1_000_000,
    }
  })
}

describe('evaluateConditions — numerical comparators', () => {
  it('AND: all conditions must hold', () => {
    // 21 bars 涨到 21,RETURN_20D = (21-1)/1 = 20
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 1.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '<=', threshold: 50.0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })

  it('AND: fails when any condition fails', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 1.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 100.0 }, // 永远假
        ],
      },
      data,
    )
    expect(ok).toBe(false)
  })

  it('OR: passes when any condition holds', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'OR',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 100.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '<=', threshold: 50.0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })

  it('null factor value is treated as not satisfied', () => {
    // 只有 3 bars,RETURN_20D 数据不足
    const data = bars([10, 11, 12])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 0 },
        ],
      },
      data,
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateConditions — cross comparators', () => {
  it('cross_up: 昨日 <= 阈值 且 今日 > 阈值', () => {
    // 11 bars 平后跳涨: today 15, last 10 all 10
    // today RETURN_5D = (15-10)/10 = 0.5
    // yesterday RETURN_5D = (10-10)/10 = 0 (从 10 bars 算)
    const data = bars([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 15])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_up', threshold: 0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })

  it('cross_up: 昨日 > 阈值 → 不命中', () => {
    // 用 11 bars: 10 个 1.0 后 1.5
    // today RETURN_5D = (1.5-1.0)/1.0 = 0.5
    // yesterday RETURN_5D = (1.0-1.0)/1.0 = 0
    // 阈值 -0.1: 0 > -0.1 → 昨日已 > 阈值 → 不命中
    const data2 = bars([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5])
    const ok2 = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_up', threshold: -0.1 },
        ],
      },
      data2,
    )
    expect(ok2).toBe(false)
  })

  it('cross_down: 昨日 >= 阈值 且 今日 < 阈值', () => {
    // 11 bars: 10 个 15 后 5
    // today RETURN_5D = (5-15)/15 ≈ -0.667
    // yesterday RETURN_5D = (15-15)/15 = 0
    // 阈值 0: 0 >= 0 ✓, today < 0 ✓ → 命中
    const data = bars([15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 5])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_down', threshold: 0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })
})

describe('evaluateConditions — empty conditions', () => {
  it('AND with 0 conditions → true (vacuously true)', () => {
    const data = bars([10, 11, 12])
    expect(
      evaluateConditions({ combinator: 'AND', conditions: [] }, data),
    ).toBe(true)
  })

  it('OR with 0 conditions → false', () => {
    const data = bars([10, 11, 12])
    expect(
      evaluateConditions({ combinator: 'OR', conditions: [] }, data),
    ).toBe(false)
  })
})