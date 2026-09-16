import { createClient } from '@/lib/supabase/server'
import type { BacktestOutput } from './types'

export interface BacktestRunRow {
  id: string
  userId: string
  strategyId: string
  startDate: string
  endDate: string
  initialCash: number
  status: 'running' | 'completed' | 'failed'
  result: BacktestOutput | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
}

interface DbRow {
  id: string
  user_id: string
  strategy_id: string
  start_date: string
  end_date: string
  initial_cash: string // numeric → string
  status: 'running' | 'completed' | 'failed'
  result: BacktestOutput | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

function rowToRun(row: DbRow): BacktestRunRow {
  return {
    id: row.id,
    userId: row.user_id,
    strategyId: row.strategy_id,
    startDate: row.start_date,
    endDate: row.end_date,
    initialCash: Number(row.initial_cash),
    status: row.status,
    result: row.result,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

/** 列出当前用户所有回测运行,按 started_at 降序 */
export async function listBacktestRuns(): Promise<BacktestRunRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listBacktestRuns failed: ${error.message}`)
  return (data ?? []).map(rowToRun)
}

/** 列出某个策略的回测运行 */
export async function listBacktestRunsByStrategy(strategyId: string): Promise<BacktestRunRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .eq('strategy_id', strategyId)
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listBacktestRunsByStrategy failed: ${error.message}`)
  return (data ?? []).map(rowToRun)
}

/** 取单个回测运行(必须在当前用户下) */
export async function getBacktestRun(id: string): Promise<BacktestRunRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getBacktestRun failed: ${error.message}`)
  return data ? rowToRun(data) : null
}