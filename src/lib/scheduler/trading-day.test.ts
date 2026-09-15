import { describe, expect, it } from 'vitest'
import { isTradingDay, nextTradingDay, prevTradingDay, getTradingDays } from './trading-day'

describe('isTradingDay', () => {
  it('weekday is trading day', () => {
    expect(isTradingDay('2026-09-15')).toBe(true) // Tuesday
  })

  it('weekend is not trading day', () => {
    expect(isTradingDay('2026-09-12')).toBe(false) // Saturday
    expect(isTradingDay('2026-09-13')).toBe(false) // Sunday
  })

  it('holiday is not trading day', () => {
    expect(isTradingDay('2026-10-01')).toBe(false) // 国庆
    expect(isTradingDay('2026-02-09')).toBe(false) // 春节
  })
})

describe('nextTradingDay', () => {
  it('next trading day after a weekday', () => {
    expect(nextTradingDay('2026-09-15')).toBe('2026-09-16') // Tue -> Wed
  })

  it('next trading day after Friday', () => {
    expect(nextTradingDay('2026-09-18')).toBe('2026-09-21') // Fri -> next Mon
  })

  it('next trading day skipping holidays', () => {
    expect(nextTradingDay('2026-09-30')).toBe('2026-10-09') // 国庆前一天 -> 国庆后第一个交易日
  })
})

describe('prevTradingDay', () => {
  it('previous trading day', () => {
    expect(prevTradingDay('2026-09-16')).toBe('2026-09-15')
  })

  it('previous trading day before Monday', () => {
    expect(prevTradingDay('2026-09-21')).toBe('2026-09-18')
  })
})

describe('getTradingDays', () => {
  it('returns trading days in range', () => {
    // 2026-09-14 (Mon) ... 2026-09-18 (Fri): 全部都是交易日
    const days = getTradingDays('2026-09-14', '2026-09-18')
    expect(days).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
  })

  it('excludes holidays', () => {
    const days = getTradingDays('2026-09-29', '2026-10-12')
    expect(days).toEqual([
      '2026-09-29', '2026-09-30',
      // 跳过 10/01-10/08 国庆
      '2026-10-09', '2026-10-12',
    ])
  })

  it('returns empty for range with no trading days', () => {
    const days = getTradingDays('2026-10-03', '2026-10-07') // 全在国庆假期内
    expect(days).toEqual([])
  })
})