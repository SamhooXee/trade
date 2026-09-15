import { createClient } from '@/lib/supabase/server'
import type { DailyBar, MinuteBar, Symbol } from './provider'

/**
 * 读 API。供回测引擎、策略求值、UI 页面使用。
 * 使用用户上下文 client (受 RLS 保护,只能读公开行情)。
 */

type AnyClient = ReturnType<typeof createClient>
type AnyRecord = Record<string, unknown>

export async function listSymbols(): Promise<Symbol[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase
    .from('trade260915a_quant_symbols') as any)
    .select('code, market, name, list_date, delist_date')
    .order('code')
  if (error) throw new Error(`listSymbols failed: ${error.message}`)
  return ((data ?? []) as AnyRecord[]).map(rowToSymbol)
}

export async function getSymbol(code: string): Promise<Symbol | null> {
  const supabase = await createClient()
  const { data, error } = await (supabase
    .from('trade260915a_quant_symbols') as any)
    .select('code, market, name, list_date, delist_date')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`getSymbol failed: ${error.message}`)
  return data ? rowToSymbol(data as AnyRecord) : null
}

export async function getDailyBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<DailyBar[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase
    .from('trade260915a_quant_daily_bars') as any)
    .select('symbol_code, trade_date, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_date')
  if (error) throw new Error(`getDailyBars failed: ${error.message}`)
  return ((data ?? []) as AnyRecord[]).map(rowToDailyBar)
}

export async function getMinuteBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<MinuteBar[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase
    .from('trade260915a_quant_minute_bars') as any)
    .select('symbol_code, trade_date, trade_time, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_time')
  if (error) throw new Error(`getMinuteBars failed: ${error.message}`)
  return ((data ?? []) as AnyRecord[]).map(rowToMinuteBar)
}

function rowToSymbol(row: AnyRecord): Symbol {
  return {
    code: row.code as string,
    market: row.market as 'SH' | 'SZ',
    name: row.name as string,
    listDate: row.list_date as string,
    delistDate: (row.delist_date as string | null) ?? null,
  }
}

function rowToDailyBar(row: AnyRecord): DailyBar {
  return {
    symbolCode: row.symbol_code as string,
    tradeDate: row.trade_date as string,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}

function rowToMinuteBar(row: AnyRecord): MinuteBar {
  return {
    symbolCode: row.symbol_code as string,
    tradeDate: row.trade_date as string,
    tradeTime: row.trade_time as string,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}