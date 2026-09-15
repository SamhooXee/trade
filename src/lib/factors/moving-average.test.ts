import { describe, it, expect } from 'vitest'
import { MA_CROSS } from './moving-average'
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

describe('MA_CROSS', () => {
  it('id and params', () => {
    expect(MA_CROSS.id).toBe('MA_CROSS')
    expect(MA_CROSS.params.length).toBe(2)
    expect(MA_CROSS.params.find((p) => p.key === 'fastPeriod')?.default).toBe(5)
    expect(MA_CROSS.params.find((p) => p.key === 'slowPeriod')?.default).toBe(20)
  })

  it('returns fast MA - slow MA', () => {
    const data = bars(Array.from({ length: 25 }, (_, i) => 10 + i))
    const v = MA_CROSS.compute(data, { fastPeriod: 5, slowPeriod: 20 })
    expect(v).not.toBeNull()
    // bars = [10, 11, ..., 34]; last 20 = [15..34], sum = (15+34)*20/2 = 490
    // last 5 = [30..34], sum = 160
    const fast = (30 + 31 + 32 + 33 + 34) / 5
    const slow = ((15 + 34) * 20) / 2 / 20
    expect(v).toBeCloseTo(fast - slow, 5)
  })

  it('returns null with insufficient history', () => {
    const data = bars([10, 11, 12, 13])
    expect(MA_CROSS.compute(data, { fastPeriod: 5, slowPeriod: 20 })).toBeNull()
  })
})