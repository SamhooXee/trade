import { describe, it, expect } from 'vitest'
import { generateRebalancePlan } from './rebalance'
import type { Portfolio, Position } from './types'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

function mkPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    userId: 'u1',
    strategyId: 's1',
    cash: 1_000_000,
    initialCash: 1_000_000,
    status: 'active',
    stopReason: null,
    startedAt: '2026-09-01T00:00:00Z',
    stoppedAt: null,
    ...overrides,
  }
}

function mkPos(symbol: string, shares: number): Position {
  return {
    id: `pos-${symbol}`,
    userId: 'u1',
    portfolioId: 'p1',
    symbolCode: symbol,
    shares,
    availableShares: shares,
    costPrice: 10,
    updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkBar(symbol: string, close: number): DailyBar {
  return {
    symbolCode: symbol,
    tradeDate: '2026-09-15',
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    amount: close * 1_000_000,
  }
}

const alwaysEntrySpec: StrategySpec = {
  entry: { combinator: 'AND', conditions: [] },
  exit: { combinator: 'OR', conditions: [] },
  holding: { maxPositions: 2, positionSizePct: 100, maxDrawdownPct: 50 },
}

describe('generateRebalancePlan', () => {
  it('returns empty plan when no symbols pass entry', () => {
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: {
        ...alwaysEntrySpec,
        entry: { combinator: 'AND', conditions: [] },
      },
      symbols: [], // 无候选
      barsBySymbol: new Map(),
      today: '2026-09-15',
    })
    expect(plan.intents).toEqual([])
  })

  it('generates BUY intents for top-N entry signals', () => {
    const barsBySymbol = new Map([
      ['600000', [mkBar('600000', 10)]],
      ['600001', [mkBar('600001', 20)]],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio({ cash: 1_000_000 }),
      positions: [],
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol,
      today: '2026-09-15',
    })
    // maxPositions=2,positionSizePct=100 → 全仓 2 笔 BUY
    expect(plan.intents.length).toBe(2)
    const buys = plan.intents.filter((i) => i.side === 'BUY')
    expect(buys.length).toBe(2)
    // 等权:每笔 500000
    expect(plan.intents[0].targetAmount).toBe(500000)
  })

  it('generates SELL for symbols not in target set', () => {
    const barsBySymbol = new Map([
      ['600000', [mkBar('600000', 10)]],
      ['600001', [mkBar('600001', 20)]],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [mkPos('600002', 1000)], // 旧持仓,不在候选 → SELL
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol,
      today: '2026-09-15',
    })
    const sells = plan.intents.filter((i) => i.side === 'SELL')
    expect(sells.length).toBe(1)
    expect(sells[0].symbolCode).toBe('600002')
  })

  it('skips symbols failing entry signal', () => {
    const noEntrySpec: StrategySpec = {
      ...alwaysEntrySpec,
      entry: {
        combinator: 'AND',
        conditions: [{ factor: 'PE_TTM', params: {}, comparator: '<', threshold: -100 }],
      },
    }
    const barsBySymbol = new Map([
      ['600000', [mkBar('600000', 10)]],
      ['600001', [mkBar('600001', 20)]],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: noEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol,
      today: '2026-09-15',
    })
    expect(plan.intents.filter((i) => i.side === 'BUY').length).toBe(0)
  })

  it('respects maxPositions cap', () => {
    const barsBySymbol = new Map([
      ['600000', [mkBar('600000', 10)]],
      ['600001', [mkBar('600001', 20)]],
      ['600002', [mkBar('600002', 30)]],
      ['600003', [mkBar('600003', 40)]],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001', '600002', '600003'],
      barsBySymbol,
      today: '2026-09-15',
    })
    // maxPositions=2 → 2 个 BUY
    expect(plan.intents.filter((i) => i.side === 'BUY').length).toBe(2)
  })
})