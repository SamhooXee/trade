import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import { ingestDailyBars, ingestMinuteBars } from './ingest'
import { getDailyBars, getMinuteBars, listSymbols, getSymbol } from './query'

const skipIfNoDb = process.env.SUPABASE_URL ? describe : describe.skip

skipIfNoDb('query', () => {
  beforeEach(async () => {
    const supabase = getServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_symbols').delete().neq('code', '__none__')
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-10', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
      { symbolCode: '600000', tradeDate: '2026-09-11', open: 10.5, high: 11.2, low: 10.3, close: 10.8, volume: 1200, amount: 12960 },
      { symbolCode: '600036', tradeDate: '2026-09-10', open: 30, high: 31, low: 29.5, close: 30.5, volume: 2000, amount: 60000 },
    ])
    await ingestMinuteBars([
      { symbolCode: '600000', tradeDate: '2026-09-10', tradeTime: '2026-09-10T01:31:00Z', open: 10, high: 10.1, low: 9.95, close: 10.05, volume: 500, amount: 5025 },
    ])
  })

  afterEach(async () => {
    const supabase = getServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trade260915a_quant_symbols').delete().neq('code', '__none__')
  })

  it('getDailyBars returns bars for range', async () => {
    const bars = await getDailyBars('600000', '2026-09-10', '2026-09-11')
    expect(bars.length).toBe(2)
    expect(bars[0].tradeDate).toBe('2026-09-10')
    expect(bars[0].close).toBe(10.5)
  })

  it('getDailyBars returns empty for symbol with no data', async () => {
    const bars = await getDailyBars('600999', '2026-09-10', '2026-09-11')
    expect(bars).toEqual([])
  })

  it('getMinuteBars returns minute bars', async () => {
    const bars = await getMinuteBars('600000', '2026-09-10', '2026-09-10')
    expect(bars.length).toBe(1)
    expect(bars[0].tradeTime).toBe('2026-09-10T01:31:00Z')
  })

  it('listSymbols returns empty when none in DB', async () => {
    const symbols = await listSymbols()
    expect(symbols).toEqual([])
  })

  it('getSymbol returns null when not in DB', async () => {
    const symbol = await getSymbol('999999')
    expect(symbol).toBeNull()
  })
})