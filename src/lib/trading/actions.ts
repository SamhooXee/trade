'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ensureActivePortfolio,
  setPortfolioStatus,
  cancelOrderIfPendingService,
} from './query'

export type TradingFormState = { error?: string } | null

/** 启动 / 重启策略 */
export async function startStrategyAction(
  strategyId: string,
): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await ensureActivePortfolio(user.id, strategyId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'errors.start_failed'
    return { error: message }
  }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${strategyId}`)
  revalidatePath('/portfolio')
  return null
}

/** 暂停 portfolio */
export async function pauseStrategyAction(
  portfolioId: string,
): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await setPortfolioStatus(portfolioId, 'paused')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'errors.pause_failed'
    return { error: message }
  }

  revalidatePath('/portfolio')
  return null
}

/** 停止 portfolio(写 stop_reason) */
export async function stopStrategyAction(
  portfolioId: string,
  stopReason = 'user_stopped',
): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await setPortfolioStatus(portfolioId, 'stopped', stopReason)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'errors.stop_failed'
    return { error: message }
  }

  revalidatePath('/portfolio')
  revalidatePath('/strategy')
  return null
}

/** 撤销 pending 订单(用户手动;状态机校验:只在 pending 时允许) */
export async function cancelOrderAction(
  orderId: string,
): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    const ok = await cancelOrderIfPendingService(orderId)
    if (!ok) return { error: 'errors.order_not_cancellable' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'errors.cancel_failed'
    return { error: message }
  }

  revalidatePath('/portfolio')
  return null
}