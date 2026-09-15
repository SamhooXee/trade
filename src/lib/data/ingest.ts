import { getServiceRoleClient } from '@/lib/supabase/service-role'
import type { DailyBar, MinuteBar } from './provider'

interface IngestResult {
  upserted: number
}

/**
 * 增量入库日线。upsert 语义: 同 (symbol_code, trade_date) 覆盖。
 * 使用 service_role client 绕过 RLS,仅服务端可用。
 */
export async function ingestDailyBars(bars: DailyBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient()
  const rows = bars.map((b) => ({
    symbol_code: b.symbolCode,
    trade_date: b.tradeDate,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    amount: b.amount,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trade260915a_quant_daily_bars')
    .upsert(rows, { onConflict: 'symbol_code,trade_date' })
  if (error) throw new Error(`ingestDailyBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function ingestMinuteBars(bars: MinuteBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient()
  const rows = bars.map((b) => ({
    symbol_code: b.symbolCode,
    trade_date: b.tradeDate,
    trade_time: b.tradeTime,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    amount: b.amount,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trade260915a_quant_minute_bars')
    .upsert(rows, { onConflict: 'symbol_code,trade_time' })
  if (error) throw new Error(`ingestMinuteBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function getLastSyncedAt(dataType: 'daily' | 'minute'): Promise<string> {
  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trade260915a_quant_ingest_state')
    .select('last_synced_at')
    .eq('data_type', dataType)
    .single()
  if (error) throw new Error(`getLastSyncedAt failed: ${error.message}`)
  return data.last_synced_at as string
}

export async function setLastSyncedAt(dataType: 'daily' | 'minute', isoTime: string): Promise<void> {
  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trade260915a_quant_ingest_state')
    .update({ last_synced_at: isoTime })
    .eq('data_type', dataType)
  if (error) throw new Error(`setLastSyncedAt failed: ${error.message}`)
}