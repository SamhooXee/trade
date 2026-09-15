import { describe, it, expect } from 'vitest'
import { PE_TTM, mockEpsTTM } from './value'
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

describe('mockEpsTTM', () => {
  it('is deterministic for same symbol', () => {
    expect(mockEpsTTM('600000')).toBe(mockEpsTTM('600000'))
  })

  it('differs between symbols', () => {
    expect(mockEpsTTM('600000')).not.toBe(mockEpsTTM('600036'))
  })

  it('returns a positive number in (0, 10)', () => {
    const eps = mockEpsTTM('600000')
    expect(eps).toBeGreaterThan(0)
    expect(eps).toBeLessThan(10)
  })
})

describe('PE_TTM', () => {
  it('id and no params', () => {
    expect(PE_TTM.id).toBe('PE_TTM')
    expect(PE_TTM.params).toEqual([])
  })

  it('PE = close / mockEpsTTM', () => {
    const data = bars([20])
    const expected = 20 / mockEpsTTM('600000')
    expect(PE_TTM.compute(data, {})).toBeCloseTo(expected, 5)
  })

  it('returns null with empty bars', () => {
    expect(PE_TTM.compute([], {})).toBeNull()
  })
})