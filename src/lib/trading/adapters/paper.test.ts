import { describe, it, expect } from 'vitest'
import { PaperBroker } from './paper'
import type { Order, Position } from '../types'

// 内存 mock:不接 Supabase,直接给 PaperBroker 一个 in-memory store
function makeBroker() {
  const orders: Order[] = []
  const positions = new Map<string, Position>()
  let cash = 1_000_000
  const cashLog = [1_000_000]
  const orderSeq = { n: 0 }
  const fillSeq = { n: 0 }

  const deps = {
    submit: (req: any) => {
      const id = `ord-${++orderSeq.n}`
      const order: Order = {
        id,
        userId: 'u1',
        portfolioId: req.portfolioId,
        symbolCode: req.symbolCode,
        side: req.side,
        shares: req.shares,
        intendedPrice: req.intendedPrice,
        tradeDate: req.tradeDate,
        status: 'pending',
        rejectReason: null,
        submittedAt: new Date().toISOString(),
        filledAt: null,
        filledPrice: null,
        filledShares: null,
        fee: null,
      }
      orders.push(order)
      return Promise.resolve(order)
    },
    loadPending: (portfolioId: string) =>
      Promise.resolve(
        orders.filter((o) => o.portfolioId === portfolioId && o.status === 'pending'),
      ),
    updateOrder: (id: string, patch: any) => {
      const o = orders.find((x) => x.id === id)
      if (!o) throw new Error(`order ${id} not found`)
      Object.assign(o, patch)
      return Promise.resolve(o)
    },
    insertFill: (fill: any) => {
      const id = `fill-${++fillSeq.n}`
      const stored = { ...fill, id }
      return Promise.resolve(stored)
    },
    loadPositions: (portfolioId: string) => {
      const ps = [...positions.values()].filter((p) => p.portfolioId === portfolioId)
      return Promise.resolve(ps)
    },
    upsertPosition: (p: any) => {
      const key = `${p.portfolioId}:${p.symbolCode}`
      const existing = positions.get(key)
      if (existing) {
        Object.assign(existing, p, { updatedAt: new Date().toISOString() })
        return Promise.resolve(existing)
      }
      const created: Position = {
        id: `pos-${positions.size + 1}`,
        userId: p.userId,
        portfolioId: p.portfolioId,
        symbolCode: p.symbolCode,
        shares: p.shares,
        availableShares: p.availableShares,
        costPrice: p.costPrice,
        updatedAt: new Date().toISOString(),
      }
      positions.set(key, created)
      return Promise.resolve(created)
    },
    loadCash: () => Promise.resolve(cash),
    saveCash: (v: number) => {
      cash = v
      cashLog.push(v)
      return Promise.resolve()
    },
  }

  const broker = new PaperBroker(deps as any)

  return {
    broker,
    _cashLog: cashLog,
    _orders: orders,
    _positions: positions,
  }
}

describe('PaperBroker.submitOrder', () => {
  it('returns a pending order', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1',
      symbolCode: '600000',
      side: 'BUY',
      shares: 1000,
      intendedPrice: 10,
      tradeDate: '2026-09-15',
    })
    expect(o.status).toBe('pending')
    expect(o.side).toBe('BUY')
  })
})

describe('PaperBroker.cancelOrder', () => {
  it('transitions pending → cancelled', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const cancelled = await broker.cancelOrder(o.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('throws when cancelling a filled order', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    // 手动标记为 filled
    await (broker as any).deps.updateOrder(o.id, { status: 'filled' })
    await expect(broker.cancelOrder(o.id)).rejects.toThrow(/cannot cancel/i)
  })
})

describe('PaperBroker.settlePendingOrders — BUY success', () => {
  it('fills at open and updates cash + position (shares unlocked=0)', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      // T+1 open bar: open=10.5, prevClose=10 (用于涨跌停判定)
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 10.5, close: 10 }]]),
    })
    expect(results[0].status).toBe('filled')
    expect(results[0].fill?.shares).toBe(1000)
    // 佣金 = max(5, 10500 × 0.00025) = 5
    expect(results[0].fill?.fee).toBeCloseTo(5, 2)
    // cash = 1000000 - 10500 - 5 = 989495
    expect(results[0].cashAfter).toBeCloseTo(989495, 2)
    // position: shares=1000, availableShares=0(T+1 锁定)
    expect(results[0].positionAfter?.shares).toBe(1000)
    expect(results[0].positionAfter?.availableShares).toBe(0)
  })
})

describe('PaperBroker.settlePendingOrders — BUY at limit-up', () => {
  it('rejects BUY when open at limit-up', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11.0, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/limit/i)
  })
})

describe('PaperBroker.settlePendingOrders — SELL', () => {
  it('sells from position with sufficient availableShares', async () => {
    const { broker } = makeBroker()
    // 先 seed 持仓:1000 股,available=1000(已 T+1 解禁)
    await (broker as any).deps.upsertPosition({
      userId: 'u1', portfolioId: 'p1', symbolCode: '600000',
      shares: 1000, availableShares: 1000, costPrice: 10,
    })
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'SELL',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11, close: 10.5 }]]),
    })
    expect(results[0].status).toBe('filled')
    expect(results[0].fill?.shares).toBe(1000)
    // 卖 11000,佣金 = max(5, 11000 × 0.00025) = 5,印花税 = 11000 × 0.001 = 11 → 16
    expect(results[0].fill?.fee).toBeCloseTo(16, 2)
    // cash = 1000000 + 11000 - 16 = 1010984
    expect(results[0].cashAfter).toBeCloseTo(1010984, 2)
    // position: shares=0, available=0
    expect(results[0].positionAfter?.shares).toBe(0)
  })

  it('rejects SELL when availableShares insufficient', async () => {
    const { broker } = makeBroker()
    // T+1 锁定中:1000 持仓但 0 可卖
    await (broker as any).deps.upsertPosition({
      userId: 'u1', portfolioId: 'p1', symbolCode: '600000',
      shares: 1000, availableShares: 0, costPrice: 10,
    })
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'SELL',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/available/i)
  })
})

describe('PaperBroker.settlePendingOrders — insufficient cash', () => {
  it('rejects BUY when cash too low', async () => {
    const { broker } = makeBroker()
    // 把 cash 调成 1000
    await (broker as any).deps.saveCash(1000)
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 10, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/cash/i)
  })
})