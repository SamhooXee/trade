import { describe, it, expect } from 'vitest'
import { simpleReturn, ma, volumeRatio } from './helpers'
import type { DailyBar } from '@/lib/data'

function mkBar(date: string, close: number, volume = 1_000_000): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    volume,
    amount: volume * close,
    close,
  }
}

describe('simpleReturn', () => {
  it('returns N-period return as decimal', () => {
    const bars = [
      mkBar('2026-01-01', 10),
      mkBar('2026-01-02', 11),
    ]
    expect(simpleReturn(bars, 1)).toBeCloseTo(0.10, 5)
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 10)]
    expect(simpleReturn(bars, 5)).toBeNull()
  })
})

describe('ma', () => {
  it('computes simple moving average over N periods', () => {
    const bars = [10, 11, 12, 13, 14].map((p, i) =>
      mkBar(`2026-01-0${i + 1}`, p),
    )
    expect(ma(bars, 3)).toBeCloseTo(13, 5) // (12+13+14)/3
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 10), mkBar('2026-01-02', 11)]
    expect(ma(bars, 5)).toBeNull()
  })
})

describe('volumeRatio', () => {
  it('returns today / average of last N', () => {
    const bars = [
      mkBar('2026-01-01', 1, 1000),
      mkBar('2026-01-02', 1, 2000),
      mkBar('2026-01-03', 1, 3000),
    ]
    expect(volumeRatio(bars, 2)).toBeCloseTo(2.0, 5) // 3000 / ((1000+2000)/2)
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 1, 1000)]
    expect(volumeRatio(bars, 5)).toBeNull()
  })
})