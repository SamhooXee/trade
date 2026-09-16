import { describe, it, expect } from 'vitest'
import { computeT1Unlock } from './settle'
import type { Fill, Position } from './types'

function mkPos(symbol: string, shares: number, available: number): Position {
  return {
    id: `pos-${symbol}`,
    userId: 'u1',
    portfolioId: 'p1',
    symbolCode: symbol,
    shares,
    availableShares: available,
    costPrice: 10,
    updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkFill(symbol: string, shares: number, filledAt: string): Fill {
  return {
    id: `fill-${symbol}-${shares}`,
    userId: 'u1',
    portfolioId: 'p1',
    orderId: 'o1',
    symbolCode: symbol,
    side: 'BUY',
    price: 10,
    shares,
    amount: shares * 10,
    fee: 5,
    filledAt,
  }
}

describe('computeT1Unlock', () => {
  it('returns 0 updates when no BUY fills yesterday', () => {
    const positions = new Map([['600000', mkPos('600000', 1000, 0)]])
    const fills: Fill[] = [] // 今天没 fill
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: fills,
      positions,
    })
    expect(updates).toEqual([])
  })

  it('skips SELL fills', () => {
    const positions = new Map([['600000', mkPos('600000', 1000, 1000)]])
    const sellFill: Fill = {
      ...mkFill('600000', 500, '2026-09-16T09:30:00Z'),
      side: 'SELL',
    }
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [sellFill],
      positions,
    })
    expect(updates).toEqual([])
  })

  it('unlocks shares from yesterday BUY fills', () => {
    // 持仓: 1000 股,available=0(T+1 锁定中)
    const positions = new Map([['600000', mkPos('600000', 1000, 0)]])
    const buyFill = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [buyFill],
      positions,
    })
    expect(updates.length).toBe(1)
    expect(updates[0]).toEqual({
      symbolCode: '600000',
      availableShares: 1000,
    })
  })

  it('unlocks multiple fills for the same symbol', () => {
    const positions = new Map([['600000', mkPos('600000', 2000, 500)]])
    const f1 = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const f2 = mkFill('600000', 500, '2026-09-16T09:31:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [f1, f2],
      positions,
    })
    expect(updates).toEqual([{ symbolCode: '600000', availableShares: 2000 }])
  })

  it('skips symbols with no position', () => {
    const positions = new Map<string, Position>()
    const buyFill = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [buyFill],
      positions,
    })
    expect(updates).toEqual([])
  })
})