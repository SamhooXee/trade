import { matchFill, DEFAULT_FEE_CONFIG } from '@/lib/backtest'
import type { BrokerAdapter } from '../broker'
import type {
  Fill,
  Order,
  OrderRequest,
  Position,
  SettleResult,
} from '../types'

/** PaperBroker 依赖(便于注入 mock;生产用 Supabase 实现见 query.ts) */
export interface PaperBrokerDeps {
  submit(req: OrderRequest): Promise<Order>
  loadPending(portfolioId: string): Promise<Order[]>
  updateOrder(id: string, patch: Partial<Order>): Promise<Order>
  insertFill(fill: Omit<Fill, 'id'>): Promise<Fill>
  loadPositions(portfolioId: string): Promise<Position[]>
  upsertPosition(p: {
    userId: string
    portfolioId: string
    symbolCode: string
    shares: number
    availableShares: number
    costPrice: number
  }): Promise<Position>
  loadCash(): Promise<number>
  saveCash(v: number): Promise<void>
}

export class PaperBroker implements BrokerAdapter {
  constructor(public readonly deps: PaperBrokerDeps) {}

  async submitOrder(req: OrderRequest): Promise<Order> {
    return this.deps.submit(req)
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const order = await this.deps.updateOrder(orderId, {})
    if (order.status !== 'pending') {
      throw new Error(`Cannot cancel order ${orderId} in status ${order.status}`)
    }
    return this.deps.updateOrder(orderId, { status: 'cancelled' })
  }

  async getOrder(_orderId: string): Promise<Order | null> {
    // 简化:本期不强求,生产端由 query.getOrder 提供
    return null
  }

  async listPendingOrders(portfolioId: string): Promise<Order[]> {
    return this.deps.loadPending(portfolioId)
  }

  async settlePendingOrders(
    orders: Order[],
    ctx: {
      bars: Map<string, { tradeDate: string; open: number; close: number }>
    },
  ): Promise<SettleResult[]> {
    const results: SettleResult[] = []
    if (orders.length === 0) return results

    let cash = await this.deps.loadCash()
    const portfolioId = orders[0].portfolioId
    const positions = new Map<string, Position>()
    for (const p of await this.deps.loadPositions(portfolioId)) {
      positions.set(p.symbolCode, p)
    }

    for (const order of orders) {
      if (order.status !== 'pending') {
        continue
      }
      const bar = ctx.bars.get(order.symbolCode)
      if (!bar) {
        await this.deps.updateOrder(order.id, {
          status: 'rejected',
          rejectReason: 'no bar for symbol',
        })
        results.push({
          orderId: order.id,
          status: 'rejected',
          rejectReason: 'no bar for symbol',
        })
        continue
      }

      // 涨跌停 / 整手 / 现金 / 股数 → 复用 Phase 2 fills。
      // 用 open 重算 targetAmount,避免 order.intendedPrice 与实际 open 不一致时
      // 整手取整后偏离用户提交的 shares。
      const req = {
        intent: {
          symbolCode: order.symbolCode,
          side: order.side,
          targetAmount: order.shares * bar.open,
        },
        nextBar: {
          symbolCode: order.symbolCode,
          tradeDate: bar.tradeDate,
          open: bar.open,
          high: bar.open,
          low: bar.open,
          close: bar.close, // ← prevClose 由调用方传
          volume: 0,
          amount: 0,
        },
        availableShares: positions.get(order.symbolCode)?.availableShares,
        availableCash: cash,
      }

      const r = matchFill(req)

      if (r.status !== 'filled' || !r.trade) {
        await this.deps.updateOrder(order.id, {
          status: 'rejected',
          rejectReason: r.reason ?? 'unknown',
        })
        results.push({
          orderId: order.id,
          status: 'rejected',
          rejectReason: r.reason,
        })
        continue
      }

      const tr = r.trade
      // 写 fill
      const fill = await this.deps.insertFill({
        userId: order.userId,
        portfolioId: order.portfolioId,
        orderId: order.id,
        symbolCode: order.symbolCode,
        side: order.side,
        price: tr.price,
        shares: tr.shares,
        amount: tr.amount,
        fee: tr.fee,
        filledAt: new Date().toISOString(),
      })

      // 更新 order 状态
      await this.deps.updateOrder(order.id, {
        status: 'filled',
        filledAt: fill.filledAt,
        filledPrice: tr.price,
        filledShares: tr.shares,
        fee: tr.fee,
      })

      // 更新 cash
      if (order.side === 'BUY') {
        cash -= tr.amount + tr.fee
      } else {
        cash += tr.amount - tr.fee
      }
      await this.deps.saveCash(cash)

      // 更新 position
      const existing = positions.get(order.symbolCode)
      let nextShares: number
      let nextAvailable: number
      let nextCost: number
      if (order.side === 'BUY') {
        if (existing) {
          const totalShares = existing.shares + tr.shares
          nextCost =
            (existing.costPrice * existing.shares + tr.price * tr.shares) / totalShares
          nextShares = totalShares
          nextAvailable = existing.availableShares // 新买入 T+1 锁定,available 不变
        } else {
          nextCost = tr.price
          nextShares = tr.shares
          nextAvailable = 0 // T+1 锁定
        }
      } else {
        // SELL
        if (!existing) throw new Error(`SELL ${order.symbolCode} but no position`)
        nextShares = existing.shares - tr.shares
        nextCost = existing.costPrice
        nextAvailable = existing.availableShares - tr.shares
        if (nextShares < 0 || nextAvailable < 0) {
          throw new Error(`Position went negative for ${order.symbolCode}`)
        }
      }
      const updated = await this.deps.upsertPosition({
        userId: order.userId,
        portfolioId: order.portfolioId,
        symbolCode: order.symbolCode,
        shares: nextShares,
        availableShares: nextAvailable,
        costPrice: nextCost,
      })
      positions.set(order.symbolCode, updated)

      results.push({
        orderId: order.id,
        status: 'filled',
        fill,
        positionAfter: {
          symbolCode: updated.symbolCode,
          shares: updated.shares,
          availableShares: updated.availableShares,
          costPrice: updated.costPrice,
        },
        cashAfter: cash,
      })
    }

    return results
  }
}

void DEFAULT_FEE_CONFIG // 保留用于未来费率覆盖