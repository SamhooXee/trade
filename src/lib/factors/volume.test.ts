import { describe, it, expect } from 'vitest'
import { VOLUME_RATIO } from './volume'
import { volumeRatio } from './helpers'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[], volumes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: volumes[i] ?? 1_000_000,
      amount: close * (volumes[i] ?? 1_000_000),
    }
  })
}

describe('VOLUME_RATIO', () => {
  it('id and default param', () => {
    expect(VOLUME_RATIO.id).toBe('VOLUME_RATIO')
    expect(VOLUME_RATIO.params[0].default).toBe(5)
  })

  it('delegates to volumeRatio helper with param period', () => {
    const data = bars([1, 1, 1, 1, 1, 1], [1000, 2000, 3000, 4000, 5000, 6000])
    expect(VOLUME_RATIO.compute(data, { period: 5 })).toBeCloseTo(volumeRatio(data, 5)!, 5)
  })

  it('returns null with insufficient history', () => {
    const data = bars([1, 1], [1000, 1000])
    expect(VOLUME_RATIO.compute(data, { period: 5 })).toBeNull()
  })
})