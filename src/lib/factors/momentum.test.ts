import { describe, it, expect } from 'vitest'
import { RETURN_5D, RETURN_20D, RETURN_60D } from './momentum'
import { simpleReturn } from './helpers'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
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

describe('RETURN_5D', () => {
  it('uses simpleReturn with period 5', () => {
    const data = bars([10, 11, 12, 13, 14, 15])
    expect(RETURN_5D.compute(data, {})).toBeCloseTo(simpleReturn(data, 5)!, 5)
  })

  it('returns null with fewer than 6 bars', () => {
    expect(RETURN_5D.compute(bars([10, 11, 12]), {})).toBeNull()
  })
})

describe('RETURN_20D', () => {
  it('uses simpleReturn with period 20', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 10 + i))
    expect(RETURN_20D.compute(data, {})).toBeCloseTo(simpleReturn(data, 20)!, 5)
  })
})

describe('RETURN_60D', () => {
  it('uses simpleReturn with period 60', () => {
    const data = bars(Array.from({ length: 61 }, (_, i) => 10 + i))
    expect(RETURN_60D.compute(data, {})).toBeCloseTo(simpleReturn(data, 60)!, 5)
  })
})

describe('id labels', () => {
  it('RETURN_5D has no params and id label', () => {
    expect(RETURN_5D.id).toBe('RETURN_5D')
    expect(RETURN_5D.params).toEqual([])
  })
})