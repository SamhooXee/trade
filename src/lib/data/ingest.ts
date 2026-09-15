import { getServiceRoleClient } from '@/lib/supabase/service-role'
import type { DailyBar, MinuteBar } from './provider'

interface IngestResult {
  upserted: number
}

// 用 any 绕过 supabase-js 的表类型推断 — 这些表没有生成 Database 类型
type AnyClient = ReturnType<typeof getServiceRoleClient>
type AnyRecord = Record<string, unknown>

/**
 * 增量入库日线。upsert 语义: 同 (symbol_code, trade_date) 覆盖。
 * 使用 service_role client 绕过 RLS,仅服务端可用。
 */
export async function ingestDailyBars(bars: DailyBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient() as AnyClient
  const rows: AnyRecord[] = bars.map((b) => ({
    symbol_code: b.symbolCode,
    trade_date: b.tradeDate,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    amount: b.amount,
  }))
  const { error } = await (supabase
    .from('trade260915a_quant_daily_bars') as any)
    .upsert(rows, { onConflict: 'symbol_code,trade_date' })
  if (error) throw new Error(`ingestDailyBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function ingestMinuteBars(bars: MinuteBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient() as AnyClient
  const rows: AnyRecord[] = bars.map((b) => ({
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
  const { error } = await (supabase
    .from('trade260915a_quant_minute_bars') as any)
    .upsert(rows, { onConflict: 'symbol_code,trade_time' })
  if (error) throw new Error(`ingestMinuteBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function getLastSyncedAt(dataType: 'daily' | 'minute'): Promise<string> {
  const supabase = getServiceRoleClient() as AnyClient
  const { data, error } = await (supabase
    .from('trade260915a_quant_ingest_state') as any)
    .select('last_synced_at')
    .eq('data_type', dataType)
    .single()
  if (error) throw new Error(`getLastSyncedAt failed: ${error.message}`)
  return (data as AnyRecord).last_synced_at as string
}

export async function setLastSyncedAt(dataType: 'daily' | 'minute', isoTime: string): Promise<void> {
  const supabase = getServiceRoleClient() as AnyClient
  const { error } = await (supabase
    .from('trade260915a_quant_ingest_state') as any)
    .update({ last_synced_at: isoTime })
    .eq('data_type', dataType)
  if (error) throw new Error(`setLastSyncedAt failed: ${error.message}`)
}