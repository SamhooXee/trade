import { describe, it, expect } from 'vitest'
import { MockDataProvider } from './mock'

describe('MockDataProvider', () => {
  const provider = new MockDataProvider()

  it('listSymbols returns mainboard symbols', async () => {
    const symbols = await provider.listSymbols()
    expect(symbols.length).toBeGreaterThan(30)
    for (const s of symbols) {
      expect(s.code).toMatch(/^(60[0-9]{4}|00[0-9]{4}|001[0-9]{3}|002[0-9]{3}|003[0-9]{3})$/)
      expect(['SH', 'SZ']).toContain(s.market)
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.delistDate).toBeNull()
    }
  })

  it('listSymbols is deterministic', async () => {
    const a = await provider.listSymbols()
    const b = await provider.listSymbols()
    expect(a[0]).toEqual(b[0])
  })

  it('getDailyBars returns ascending dates', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    expect(bars.length).toBeGreaterThan(0)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].tradeDate > bars[i - 1].tradeDate).toBe(true)
    }
    expect(bars[0].symbolCode).toBe('600000')
  })

  it('getDailyBars skips weekends', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-04', '2025-01-10') // 含周六周日
    for (const b of bars) {
      const day = new Date(b.tradeDate).getUTCDay()
      expect(day).not.toBe(0) // Sunday
      expect(day).not.toBe(6) // Saturday
    }
  })

  it('getDailyBars respects mainboard ±10% limit', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-06', '2025-06-30')
    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1].close
      const open = bars[i].open
      const ratio = (open - prev) / prev
      // 允许 ±10% 加 0.01% 浮点容忍
      expect(Math.abs(ratio)).toBeLessThanOrEqual(0.1001)
    }
  })

  it('getDailyBars is deterministic for same input', async () => {
    const a = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    const b = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    expect(a).toEqual(b)
  })

  it('getDailyBarsSince returns bars from since onwards', async () => {
    const bars = await provider.getDailyBarsSince('600000', '2025-06-01')
    expect(bars.length).toBeGreaterThan(0)
    for (const b of bars) {
      expect(b.tradeDate >= '2025-06-01').toBe(true)
    }
  })

  it('getMinuteBars returns 240 bars per trading day', async () => {
    const bars = await provider.getMinuteBars('600000', '2025-01-06', '2025-01-06')
    expect(bars.length).toBe(240) // 9:30-11:30 (120) + 13:00-15:00 (120)
    for (const b of bars) {
      expect(b.tradeDate).toBe('2025-01-06')
      expect(b.symbolCode).toBe('600000')
    }
  })

  it('different symbols generate different prices (seed differs)', async () => {
    const a = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    const b = await provider.getDailyBars('600036', '2025-01-06', '2025-01-10')
    expect(a[0].close).not.toBe(b[0].close)
  })
})