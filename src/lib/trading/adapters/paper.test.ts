import { describe, it, expect } from 'vitest'
import { PaperBroker, type PaperBrokerDeps } from './paper'
import type {
  Fill,
  Order,
  OrderRequest,
  OrderSide,
  Position,
  OrderStatus,
} from '../types'

// 内存 mock:不接 Supabase,直接给 PaperBroker 一个 in-memory store
function makeBroker() {
  const orders: Order[] = []
  const positions = new Map<string, Position>()
  let cash = 1_000_000
  const cashLog = [1_000_000]
  const orderSeq = { n: 0 }
  const fillSeq = { n: 0 }

  const deps: PaperBrokerDeps = {
    submit: (req: OrderRequest) => {
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
    updateOrder: (id: string, patch: Partial<Order>) => {
      const o = orders.find((x) => x.id === id)
      if (!o) throw new Error(`order ${id} not found`)
      Object.assign(o, patch)
      return Promise.resolve(o)
    },
    insertFill: (fill: Omit<Fill, 'id'>) => {
      const id = `fill-${++fillSeq.n}`
      const stored: Fill = { ...fill, id }
      return Promise.resolve(stored)
    },
    loadPositions: (portfolioId: string) => {
      const ps = [...positions.values()].filter((p) => p.portfolioId === portfolioId)
      return Promise.resolve(ps)
    },
    upsertPosition: (p) => {
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

  const broker = new PaperBroker(deps)

  return {
    broker,
    _cashLog: cashLog,
    _orders: orders,
    _positions: positions,
    _setCash: (v: number) => {
      cash = v
    },
  }
}

// 类型辅助
type InsertOrderArgs = {
  portfolioId: string
  symbolCode: string
  side: OrderSide
  shares: number
  intendedPrice: number
  tradeDate: string
}
type SetStatusFn = (id: string, status: OrderStatus) => Promise<void>

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
    } satisfies InsertOrderArgs)
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
    const updateOrder = broker.deps.updateOrder
    await updateOrder(o.id, { status: 'filled' })
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
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 10.5, close: 10 }]]),
    })
    expect(results[0].status).toBe('filled')
    expect(results[0].fill?.shares).toBe(1000)
    expect(results[0].fill?.fee).toBeCloseTo(5, 2)
    expect(results[0].cashAfter).toBeCloseTo(989495, 2)
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
    const upsertPosition = broker.deps.upsertPosition
    await upsertPosition({
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
    expect(results[0].fill?.fee).toBeCloseTo(16, 2)
    expect(results[0].cashAfter).toBeCloseTo(1010984, 2)
    expect(results[0].positionAfter?.shares).toBe(0)
  })

  it('rejects SELL when availableShares insufficient', async () => {
    const { broker } = makeBroker()
    const upsertPosition = broker.deps.upsertPosition
    await upsertPosition({
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
    const saveCash = broker.deps.saveCash
    await saveCash(1000)
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

void {} as unknown as InsertOrderArgs
void {} as unknown as SetStatusFn