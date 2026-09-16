'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStrategy } from '@/lib/strategy/query'
import { getProvider } from '@/lib/data'
import { isTradingDay } from '@/lib/scheduler'
import { runBacktest } from './engine'

export type BacktestFormState = {
  error?: string
  fieldErrors?: Record<string, string[]>
} | null

/**
 * 创建并同步运行一次回测。
 * 同步执行(假设单次 < 5s);Phase 4 改为异步。
 */
export async function createBacktestRunAction(
  strategyId: string,
  _prev: BacktestFormState,
  formData: FormData,
): Promise<BacktestFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const startDate = String(formData.get('startDate') ?? '').trim()
  const endDate = String(formData.get('endDate') ?? '').trim()
  const initialCashRaw = Number(formData.get('initialCash') ?? 1_000_000)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { fieldErrors: { date: ['quant.errors.invalid_date'] } }
  }
  if (new Date(endDate) < new Date(startDate)) {
    return { fieldErrors: { date: ['quant.errors.end_before_start'] } }
  }
  if (!(initialCashRaw > 0)) {
    return { fieldErrors: { initialCash: ['quant.errors.invalid_cash'] } }
  }

  const strategy = await getStrategy(strategyId)
  if (!strategy) return { error: 'quant.errors.strategy_not_found' }

  // 1. 插入 running 行
  const { data: inserted, error: insertErr } = await supabase
    .from('trade260915a_backtest_runs')
    .insert({
      user_id: user.id,
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_cash: initialCashRaw,
      status: 'running',
    })
    .select('id')
    .single()
  if (insertErr || !inserted) return { error: insertErr?.message ?? 'quant.errors.insert_failed' }

  const runId = inserted.id

  // 2. 拉取候选股票(本期默认全主板)
  const provider = getProvider()
  const symbols = await provider.listSymbols()
  const symbolCodes = symbols.map((s) => s.code)

  // 3. 同步执行回测
  try {
    const output = await runBacktest({
      spec: strategy.spec,
      startDate,
      endDate,
      initialCash: initialCashRaw,
      symbols: symbolCodes,
      loadBars: async (sym, from, to) => {
        return provider.getDailyBars(sym, from, to)
      },
      loadBarsForFill: async (sym, from, to) => {
        return provider.getDailyBars(sym, from, to)
      },
      isTradingDay,
    })

    await supabase
      .from('trade260915a_backtest_runs')
      .update({
        status: 'completed',
        result: output,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('trade260915a_backtest_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return { error: 'quant.errors.backtest_failed' }
  }

  revalidatePath('/backtest')
  revalidatePath('/strategy')
  revalidatePath(`/strategy/${strategyId}`)
  redirect(`/backtest/${runId}`)
}