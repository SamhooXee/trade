import { describe, it, expect } from 'vitest'
import {
  PERIODS,
  PERIOD_DEFAULT,
  parsePeriod,
  periodStartDate,
} from './period'

describe('parsePeriod', () => {
  it.each(PERIODS)('returns input as-is when valid: %s', (p) => {
    expect(parsePeriod(p)).toBe(p)
  })

  it('returns default when input is undefined', () => {
    expect(parsePeriod(undefined)).toBe(PERIOD_DEFAULT)
  })

  it('returns default when input is invalid string', () => {
    expect(parsePeriod('xyz')).toBe(PERIOD_DEFAULT)
    expect(parsePeriod('5y')).toBe(PERIOD_DEFAULT)
    expect(parsePeriod('')).toBe(PERIOD_DEFAULT)
  })
})

describe('periodStartDate', () => {
  const today = new Date('2026-09-16T00:00:00Z')

  it('1m → today − 30 days', () => {
    expect(periodStartDate('1m', today)).toBe('2026-08-17')
  })

  it('3m → today − 90 days', () => {
    expect(periodStartDate('3m', today)).toBe('2026-06-18')
  })

  it('6m → today − 180 days', () => {
    expect(periodStartDate('6m', today)).toBe('2026-03-20')
  })

  it('1y → today − 365 days', () => {
    expect(periodStartDate('1y', today)).toBe('2025-09-16')
  })

  it('all → ALL_START_DATE (业务起点 2025-01-01)', () => {
    expect(periodStartDate('all', today)).toBe('2025-01-01')
  })

  it('不同 today 下结果相应平移', () => {
    const other = new Date('2027-01-01T00:00:00Z')
    expect(periodStartDate('3m', other)).toBe('2026-10-03')
    expect(periodStartDate('all', other)).toBe('2025-01-01')
  })
})