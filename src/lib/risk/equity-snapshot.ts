import type { EquitySnapshot, Position } from '@/lib/trading'

/** snapshot 唯一键:portfolio + trade_date */
export function snapshotKey(portfolioId: string, tradeDate: string): string {
  return `${portfolioId}|${tradeDate}`
}

/** 计算 equity = cash + Σ(shares × lastClose) */
export function computeEquityFromPortfolio(input: {
  cash: number
  positions: Pick<Position, 'symbolCode' | 'shares'>[]
  lastCloseBySymbol: Map<string, number>
}): number {
  let marketValue = 0
  for (const p of input.positions) {
    const close = input.lastCloseBySymbol.get(p.symbolCode)
    if (close !== undefined) marketValue += p.shares * close
  }
  return input.cash + marketValue
}

/** EquitySnapshot upsert 入参(给 service-role helper 调用) */
export interface UpsertEquitySnapshotInput {
  userId: string
  portfolioId: string
  tradeDate: string
  equity: number
  cash: number
  marketValue: number
}

/**
 * 序列化为 Supabase 行(供上层 query.ts 用)。
 * 本函数纯数据转换,不直接做 IO;IO 在 query.ts 里。
 */
export function toDbEquitySnapshotRow(input: UpsertEquitySnapshotInput) {
  return {
    user_id: input.userId,
    portfolio_id: input.portfolioId,
    trade_date: input.tradeDate,
    equity: input.equity,
    cash: input.cash,
    market_value: input.marketValue,
  }
}

export function fromDbEquitySnapshotRow(row: {
  id: string
  user_id: string
  portfolio_id: string
  trade_date: string
  equity: string | number
  cash: string | number
  market_value: string | number
  recorded_at: string
}): EquitySnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    portfolioId: row.portfolio_id,
    tradeDate: row.trade_date,
    equity: Number(row.equity),
    cash: Number(row.cash),
    marketValue: Number(row.market_value),
    recordedAt: row.recorded_at,
  }
}