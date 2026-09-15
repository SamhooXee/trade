import { createClient } from '@/lib/supabase/server'
import type { DailyBar, MinuteBar, Symbol } from './provider'

/**
 * 读 API。供回测引擎、策略求值、UI 页面使用。
 * 使用用户上下文 client (受 RLS 保护,只能读公开行情)。
 */

export async function listSymbols(): Promise<Symbol[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code, market, name, list_date, delist_date')
    .order('code')
  if (error) throw new Error(`listSymbols failed: ${error.message}`)
  return (data ?? []).map(rowToSymbol)
}

export async function getSymbol(code: string): Promise<Symbol | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code, market, name, list_date, delist_date')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`getSymbol failed: ${error.message}`)
  return data ? rowToSymbol(data) : null
}

export async function getDailyBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<DailyBar[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_daily_bars')
    .select('symbol_code, trade_date, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_date')
  if (error) throw new Error(`getDailyBars failed: ${error.message}`)
  return (data ?? []).map(rowToDailyBar)
}

export async function getMinuteBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<MinuteBar[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_minute_bars')
    .select('symbol_code, trade_date, trade_time, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_time')
  if (error) throw new Error(`getMinuteBars failed: ${error.message}`)
  return (data ?? []).map(rowToMinuteBar)
}

type SymbolRow = {
  code: string
  market: 'SH' | 'SZ'
  name: string
  list_date: string
  delist_date: string | null
}

type BarRow = {
  symbol_code: string
  trade_date: string
  trade_time?: string
  open: number | string
  high: number | string
  low: number | string
  close: number | string
  volume: number | string
  amount: number | string
}

function rowToSymbol(row: SymbolRow): Symbol {
  return {
    code: row.code,
    market: row.market,
    name: row.name,
    listDate: row.list_date,
    delistDate: row.delist_date,
  }
}

function rowToDailyBar(row: BarRow): DailyBar {
  return {
    symbolCode: row.symbol_code,
    tradeDate: row.trade_date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}

function rowToMinuteBar(row: Required<BarRow>): MinuteBar {
  return {
    symbolCode: row.symbol_code,
    tradeDate: row.trade_date,
    tradeTime: row.trade_time,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}