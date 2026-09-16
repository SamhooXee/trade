import { createClient } from '@/lib/supabase/server'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import type { Portfolio, Position, Order, Fill, StrategyRunLogEntry } from './types'

// ============ 类型 ============

interface DbPortfolio {
  id: string
  user_id: string
  strategy_id: string
  cash: string
  initial_cash: string
  status: 'active' | 'paused' | 'stopped'
  stop_reason: string | null
  started_at: string
  stopped_at: string | null
}

interface DbPosition {
  id: string
  user_id: string
  portfolio_id: string
  symbol_code: string
  shares: number
  available_shares: number
  cost_price: string
  updated_at: string
}

interface DbOrder {
  id: string
  user_id: string
  portfolio_id: string
  symbol_code: string
  side: 'BUY' | 'SELL'
  shares: number
  intended_price: string
  trade_date: string
  status: 'pending' | 'filled' | 'rejected' | 'cancelled'
  reject_reason: string | null
  submitted_at: string
  filled_at: string | null
  filled_price: string | null
  filled_shares: number | null
  fee: string | null
}

interface DbFill {
  id: string
  user_id: string
  portfolio_id: string
  order_id: string
  symbol_code: string
  side: 'BUY' | 'SELL'
  price: string
  shares: number
  amount: string
  fee: string
  filled_at: string
}

interface DbRunLog {
  id: string
  user_id: string
  portfolio_id: string
  trade_date: string
  run_at: string
  signals_count: number
  orders_count: number
  notes: string | null
}

function toPortfolio(r: DbPortfolio): Portfolio {
  return {
    id: r.id,
    userId: r.user_id,
    strategyId: r.strategy_id,
    cash: Number(r.cash),
    initialCash: Number(r.initial_cash),
    status: r.status,
    stopReason: r.stop_reason,
    startedAt: r.started_at,
    stoppedAt: r.stopped_at,
  }
}

function toPosition(r: DbPosition): Position {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    symbolCode: r.symbol_code,
    shares: r.shares,
    availableShares: r.available_shares,
    costPrice: Number(r.cost_price),
    updatedAt: r.updated_at,
  }
}

function toOrder(r: DbOrder): Order {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    symbolCode: r.symbol_code,
    side: r.side,
    shares: r.shares,
    intendedPrice: Number(r.intended_price),
    tradeDate: r.trade_date,
    status: r.status,
    rejectReason: r.reject_reason,
    submittedAt: r.submitted_at,
    filledAt: r.filled_at,
    filledPrice: r.filled_price ? Number(r.filled_price) : null,
    filledShares: r.filled_shares,
    fee: r.fee ? Number(r.fee) : null,
  }
}

function toFill(r: DbFill): Fill {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    orderId: r.order_id,
    symbolCode: r.symbol_code,
    side: r.side,
    price: Number(r.price),
    shares: r.shares,
    amount: Number(r.amount),
    fee: Number(r.fee),
    filledAt: r.filled_at,
  }
}

// ============ RLS 客户端(用户上下文) ============

/** 当前用户的所有 portfolios */
export async function listPortfolios(): Promise<Portfolio[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listPortfolios failed: ${error.message}`)
  return (data ?? []).map(toPortfolio)
}

/** 当前用户的某个策略对应的 portfolio */
export async function getPortfolioByStrategy(strategyId: string): Promise<Portfolio | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('strategy_id', strategyId)
    .maybeSingle()
  if (error) throw new Error(`getPortfolioByStrategy failed: ${error.message}`)
  return data ? toPortfolio(data) : null
}

/** 列出 portfolio 的所有持仓 */
export async function listPositions(portfolioId: string): Promise<Position[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('symbol_code', { ascending: true })
  if (error) throw new Error(`listPositions failed: ${error.message}`)
  return (data ?? []).map(toPosition)
}

/** 列出当前用户的成交明细 */
export async function listFills(limit = 200): Promise<Fill[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .order('filled_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listFills failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

/** 列出 portfolio 的成交明细 */
export async function listFillsByPortfolio(
  portfolioId: string,
  limit = 200,
): Promise<Fill[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('filled_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listFillsByPortfolio failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

/** 列出当前用户的策略运行日志 */
export async function listRunLogs(
  portfolioId?: string,
): Promise<StrategyRunLogEntry[]> {
  const supabase = await createClient()
  let query = supabase
    .from('trade260915a_strategy_run_log')
    .select('*')
    .order('run_at', { ascending: false })
  if (portfolioId) query = query.eq('portfolio_id', portfolioId)
  const { data, error } = await query
  if (error) throw new Error(`listRunLogs failed: ${error.message}`)
  return (data ?? []).map((r: DbRunLog) => ({
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    tradeDate: r.trade_date,
    runAt: r.run_at,
    signalsCount: r.signals_count,
    ordersCount: r.orders_count,
    notes: r.notes,
  }))
}

// ============ Server Actions helpers(用户上下文) ============

/** 启动 / 重启 portfolio:存在则激活,不存在则创建 */
export async function ensureActivePortfolio(
  userId: string,
  strategyId: string,
): Promise<Portfolio> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) {
    const { data: updated, error } = await supabase
      .from('trade260915a_portfolios')
      .update({ status: 'active', stopped_at: null, stop_reason: null })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error(`ensureActivePortfolio failed: ${error.message}`)
    return toPortfolio(updated)
  }
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .insert({ user_id: userId, strategy_id: strategyId })
    .select('*')
    .single()
  if (error) throw new Error(`ensureActivePortfolio insert failed: ${error.message}`)
  return toPortfolio(data)
}

export async function setPortfolioStatus(
  portfolioId: string,
  status: 'active' | 'paused' | 'stopped',
  stopReason: string | null = null,
): Promise<Portfolio> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .update({
      status,
      stop_reason: stopReason,
      stopped_at: status === 'stopped' ? new Date().toISOString() : null,
    })
    .eq('id', portfolioId)
    .select('*')
    .single()
  if (error) throw new Error(`setPortfolioStatus failed: ${error.message}`)
  return toPortfolio(data)
}

// ============ Service-role helpers(cron 使用,绕 RLS) ============

/** 列出所有 active portfolios(cron run-strategies 用) */
export async function listActivePortfoliosService(): Promise<Portfolio[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('status', 'active')
  if (error) throw new Error(`listActivePortfoliosService failed: ${error.message}`)
  return (data ?? []).map(toPortfolio)
}

export async function getPortfolioService(id: string): Promise<Portfolio | null> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getPortfolioService failed: ${error.message}`)
  return data ? toPortfolio(data) : null
}

export async function listPositionsService(portfolioId: string): Promise<Position[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
  if (error) throw new Error(`listPositionsService failed: ${error.message}`)
  return (data ?? []).map(toPosition)
}

export async function upsertPositionService(
  p: Omit<Position, 'id' | 'updatedAt'>,
): Promise<Position> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .upsert(
      {
        user_id: p.userId,
        portfolio_id: p.portfolioId,
        symbol_code: p.symbolCode,
        shares: p.shares,
        available_shares: p.availableShares,
        cost_price: p.costPrice,
      },
      { onConflict: 'portfolio_id,symbol_code' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`upsertPositionService failed: ${error.message}`)
  return toPosition(data)
}

export async function insertOrderService(order: {
  userId: string
  portfolioId: string
  symbolCode: string
  side: 'BUY' | 'SELL'
  shares: number
  intendedPrice: number
  tradeDate: string
}): Promise<Order | null> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .insert({
      user_id: order.userId,
      portfolio_id: order.portfolioId,
      symbol_code: order.symbolCode,
      side: order.side,
      shares: order.shares,
      intended_price: order.intendedPrice,
      trade_date: order.tradeDate,
      status: 'pending',
    })
    .select('*')
    .maybeSingle()
  // 23505 = unique_violation → 视为已存在(幂等),返回 null
  if (error && (error as { code?: string }).code !== '23505') {
    throw new Error(`insertOrderService failed: ${error.message}`)
  }
  return data ? toOrder(data) : null
}

export async function updateOrderService(
  id: string,
  patch: Partial<DbOrder>,
): Promise<Order> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updateOrderService failed: ${error.message}`)
  return toOrder(data)
}

/**
 * 原子取消:只在 status='pending' 时把状态改成 'cancelled'。
 * 返回 true = 成功;false = 订单不存在或不是 pending(状态机拒绝)。
 */
export async function cancelOrderIfPendingService(id: string): Promise<boolean> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`cancelOrderIfPendingService failed: ${error.message}`)
  return data !== null
}

export async function listPendingOrdersService(tradeDate: string): Promise<Order[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .select('*')
    .eq('status', 'pending')
    .eq('trade_date', tradeDate)
  if (error) throw new Error(`listPendingOrdersService failed: ${error.message}`)
  return (data ?? []).map(toOrder)
}

export async function listPendingOrdersByPortfolioService(
  portfolioId: string,
): Promise<Order[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('status', 'pending')
  if (error) throw new Error(`listPendingOrdersByPortfolioService failed: ${error.message}`)
  return (data ?? []).map(toOrder)
}

export async function insertFillService(
  fill: Omit<Fill, 'id' | 'filledAt'>,
): Promise<Fill> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .insert({
      user_id: fill.userId,
      portfolio_id: fill.portfolioId,
      order_id: fill.orderId,
      symbol_code: fill.symbolCode,
      side: fill.side,
      price: fill.price,
      shares: fill.shares,
      amount: fill.amount,
      fee: fill.fee,
    })
    .select('*')
    .single()
  if (error) throw new Error(`insertFillService failed: ${error.message}`)
  return toFill(data)
}

export async function savePortfolioCashService(
  portfolioId: string,
  cash: number,
): Promise<void> {
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('trade260915a_portfolios')
    .update({ cash })
    .eq('id', portfolioId)
  if (error) throw new Error(`savePortfolioCashService failed: ${error.message}`)
}

export async function insertRunLogService(log: {
  userId: string
  portfolioId: string
  tradeDate: string
  signalsCount: number
  ordersCount: number
  notes: string | null
}): Promise<StrategyRunLogEntry | null> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_strategy_run_log')
    .insert({
      user_id: log.userId,
      portfolio_id: log.portfolioId,
      trade_date: log.tradeDate,
      signals_count: log.signalsCount,
      orders_count: log.ordersCount,
      notes: log.notes,
    })
    .select('*')
    .maybeSingle()
  // 幂等:同 portfolio + trade_date 已存在则返回 null
  if (error && (error as { code?: string }).code !== '23505') {
    throw new Error(`insertRunLogService failed: ${error.message}`)
  }
  return data
    ? {
        id: data.id,
        userId: data.user_id,
        portfolioId: data.portfolio_id,
        tradeDate: data.trade_date,
        runAt: data.run_at,
        signalsCount: data.signals_count,
        ordersCount: data.orders_count,
        notes: data.notes,
      }
    : null
}

export async function listFillsByDateService(date: string): Promise<Fill[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .gte('filled_at', `${date}T00:00:00Z`)
    .lt('filled_at', `${date}T23:59:59.999Z`)
    .eq('side', 'BUY')
  if (error) throw new Error(`listFillsByDateService failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

export async function updatePositionAvailableSharesService(
  portfolioId: string,
  symbolCode: string,
  availableShares: number,
): Promise<void> {
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('trade260915a_positions')
    .update({ available_shares: availableShares, updated_at: new Date().toISOString() })
    .eq('portfolio_id', portfolioId)
    .eq('symbol_code', symbolCode)
  if (error)
    throw new Error(`updatePositionAvailableSharesService failed: ${error.message}`)
}