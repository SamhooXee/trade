import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import { ingestDailyBars, ingestMinuteBars, getLastSyncedAt, setLastSyncedAt } from './ingest'

// 这些测试需要本地 Supabase 运行。CI 用 ephemeral Postgres。
const skipIfNoDb = process.env.SUPABASE_URL ? describe : describe.skip

skipIfNoDb('ingest', () => {
  beforeEach(async () => {
    const supabase = getServiceRoleClient() as any
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_ingest_state').update({ last_synced_at: '1970-01-01T00:00:00Z' })
      .in('data_type', ['daily', 'minute'])
  })

  afterEach(async () => {
    const supabase = getServiceRoleClient() as any
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
  })

  it('ingestDailyBars inserts new bars', async () => {
    const result = await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
      { symbolCode: '600000', tradeDate: '2026-09-16', open: 10.5, high: 11.2, low: 10.3, close: 10.8, volume: 1200, amount: 12960 },
    ])
    expect(result.upserted).toBe(2)
  })

  it('ingestDailyBars updates existing bar (upsert)', async () => {
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
    ])
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.6, volume: 1000, amount: 10600 },
    ])
    const supabase = getServiceRoleClient() as any
    const { data } = await supabase.from('trade260915a_quant_daily_bars')
      .select('close, amount')
      .eq('symbol_code', '600000')
      .eq('trade_date', '2026-09-15')
      .single()
    expect(data?.close).toBe('10.6000')
    expect(data?.amount).toBe('10600')
  })

  it('ingestMinuteBars inserts new bars', async () => {
    const result = await ingestMinuteBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', tradeTime: '2026-09-15T01:31:00Z', open: 10, high: 10.1, low: 9.95, close: 10.05, volume: 500, amount: 5025 },
    ])
    expect(result.upserted).toBe(1)
  })

  it('getLastSyncedAt returns initial epoch', async () => {
    const t = await getLastSyncedAt('daily')
    expect(t).toBe('1970-01-01T00:00:00.000Z')
  })

  it('setLastSyncedAt updates the cursor', async () => {
    await setLastSyncedAt('daily', '2026-09-15T12:00:00Z')
    const t = await getLastSyncedAt('daily')
    expect(t).toBe('2026-09-15T12:00:00.000Z')
  })
})