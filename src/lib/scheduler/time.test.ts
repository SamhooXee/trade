import { describe, expect, it } from 'vitest'
import { getSession, toBeijingTime, toUtcTime } from './time'

describe('getSession', () => {
  it('pre-market before 9:30 北京', () => {
    // 9:29 北京 = 1:29 UTC
    expect(getSession(new Date('2026-09-15T01:29:00Z'))).toBe('pre_market')
  })

  it('morning 9:30-11:30 北京', () => {
    expect(getSession(new Date('2026-09-15T01:30:00Z'))).toBe('morning')
    expect(getSession(new Date('2026-09-15T03:30:00Z'))).toBe('morning')
  })

  it('lunch 11:30-13:00 北京', () => {
    // 11:31 北京 = 3:31 UTC
    expect(getSession(new Date('2026-09-15T03:31:00Z'))).toBe('lunch')
    expect(getSession(new Date('2026-09-15T05:00:00Z'))).toBe('lunch')
  })

  it('afternoon 13:00-15:00 北京', () => {
    expect(getSession(new Date('2026-09-15T05:01:00Z'))).toBe('afternoon')
    expect(getSession(new Date('2026-09-15T07:00:00Z'))).toBe('afternoon')
  })

  it('post-market after 15:00 北京', () => {
    // 15:01 北京 = 7:01 UTC
    expect(getSession(new Date('2026-09-15T07:01:00Z'))).toBe('post_market')
  })
})

describe('toBeijingTime', () => {
  it('UTC 1:30 → 北京 9:30', () => {
    const utc = new Date('2026-09-15T01:30:00Z')
    const bjt = toBeijingTime(utc)
    expect(bjt.getUTCHours()).toBe(9)
    expect(bjt.getUTCMinutes()).toBe(30)
  })
})

describe('toUtcTime', () => {
  it('北京 9:30 → UTC 1:30', () => {
    const bjt = new Date('2026-09-15T09:30:00Z') // 用 UTC 字段表示北京时间
    const utc = toUtcTime(bjt)
    expect(utc.getUTCHours()).toBe(1)
    expect(utc.getUTCMinutes()).toBe(30)
  })
})