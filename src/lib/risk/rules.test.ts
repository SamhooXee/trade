import { describe, it, expect } from 'vitest'
import {
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
} from './rules'
import type { RiskContext } from './types'
import type {
  RebalancePlan,
  RebalanceIntent,
  Portfolio,
  Position,
} from '@/lib/trading'

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

function mkPos(symbol: string, shares: number, available = shares): Position {
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

function mkCtx(overrides: Partial<RiskContext> = {}): RiskContext {
  const positions = overrides.positions ?? []
  return {
    portfolio: overrides.portfolio ?? mkPortfolio(),
    positions,
    positionsBySymbol: new Map(positions.map((p) => [p.symbolCode, p])),
    cash: overrides.cash ?? 1_000_000,
    equity: overrides.equity ?? 1_000_000,
    peakEquity: overrides.peakEquity ?? 1_000_000,
    today: overrides.today ?? '2026-09-15',
    appliedModifies: overrides.appliedModifies ?? [],
  }
}

function mkIntent(
  symbol: string,
  side: 'BUY' | 'SELL',
  shares: number,
  price: number,
): RebalanceIntent {
  return {
    symbolCode: symbol,
    side,
    shares,
    intendedPrice: price,
    targetAmount: shares * price,
  }
}

function mkPlan(intents: RebalanceIntent[]): RebalancePlan {
  return { intents }
}

// ====== INSUFFICIENT_BUYING_POWER ======
describe('insufficientBuyingPowerRule', () => {
  it('allows when cash covers all BUY intents', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 1000, 10)]) // 10000
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 1_000_000 }))
    expect(r.kind).toBe('allow')
  })

  it('rejects single BUY intent exceeding cash', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 200_000, 10)]) // 2_000_000
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 1_000_000 }))
    expect(r.kind).toBe('reject')
    if (r.kind === 'reject')
      expect(r.reasonCode).toBe('INSUFFICIENT_BUYING_POWER')
  })

  it('ignores SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1000, 10)])
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 0 }))
    expect(r.kind).toBe('allow')
  })

  it('returns first failure as reject', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100, 10), // OK
      mkIntent('600001', 'BUY', 200_000, 10), // FAIL
    ])
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 5000 }))
    expect(r.kind).toBe('reject')
  })
})

// ====== INSUFFICIENT_SELLABLE_SHARES ======
describe('insufficientSellableSharesRule', () => {
  it('allows SELL within availableShares', () => {
    const positions = [mkPos('600000', 1000, 1000)]
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ positions }))
    expect(r.kind).toBe('allow')
  })

  it('rejects SELL exceeding availableShares', () => {
    const positions = [mkPos('600000', 1000, 0)] // T+1 锁定
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ positions }))
    expect(r.kind).toBe('reject')
  })

  it('rejects SELL with no position at all', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(
      plan,
      mkCtx({ positions: [] }),
    )
    expect(r.kind).toBe('reject')
  })

  it('ignores BUY intents', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100_000, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ cash: 0 }))
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_POSITION_PCT ======
describe('maxPositionPctRule', () => {
  it('allows when BUY within limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 10_000, 10)]) // 100_000 = 10%
    const r = maxPositionPctRule.evaluate(
      plan,
      mkCtx({ equity: 1_000_000 }),
      20,
    )
    expect(r.kind).toBe('allow')
  })

  it('modifies BUY to cap at limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 30_000, 10)]) // 300_000 = 30%
    const r = maxPositionPctRule.evaluate(
      plan,
      mkCtx({ equity: 1_000_000 }),
      20,
    )
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // limit 20% of 1_000_000 = 200_000 → shares = 200_000 / 10 = 20_000
      expect(r.changes[0].shares).toBe(20_000)
    }
  })

  it('rounds shares to integer (floor)', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100_000, 10.01)]) // targetAmount = 1_001_000
    const r = maxPositionPctRule.evaluate(
      plan,
      mkCtx({ equity: 1_000_000 }),
      20,
    )
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // limit 200_000 → shares = floor(200_000 / 10.01) = 19_980
      expect(r.changes[0].shares).toBe(19_980)
    }
  })

  it('skips SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1000, 10)])
    const r = maxPositionPctRule.evaluate(plan, mkCtx(), 5)
    expect(r.kind).toBe('allow')
  })

  it('drops BUY entirely when limit below 1 share', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 1000, 10_000)]) // 10_000_000
    const r = maxPositionPctRule.evaluate(
      plan,
      mkCtx({ equity: 1_000 }),
      10,
    ) // limit = 100
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // 100 / 10_000 = 0.01 → floor = 0 → 0 shares
      expect(r.changes[0].shares).toBe(0)
    }
  })
})

// ====== MAX_POSITIONS ======
describe('maxPositionsRule', () => {
  it('allows when positions count within limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100, 10)])
    const r = maxPositionsRule.evaluate(plan, mkCtx(), 5)
    expect(r.kind).toBe('allow')
  })

  it('rejects when new positions would exceed limit', () => {
    // 已持仓 3 笔,新 plan 还要买 3 笔 → 总 6 > 5
    const positions = [
      mkPos('600010', 100),
      mkPos('600011', 100),
      mkPos('600012', 100),
    ]
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100, 10),
      mkIntent('600001', 'BUY', 100, 10),
      mkIntent('600002', 'BUY', 100, 10),
    ])
    const r = maxPositionsRule.evaluate(plan, mkCtx({ positions }), 5)
    expect(r.kind).toBe('reject')
    if (r.kind === 'reject') {
      expect(r.reasonParams).toMatchObject({ count: 6, limit: 5 })
    }
  })

  it('allows SELL of existing position (no new position added)', () => {
    const positions = [mkPos('600000', 100)]
    const plan = mkPlan([mkIntent('600000', 'SELL', 100, 10)])
    const r = maxPositionsRule.evaluate(plan, mkCtx({ positions }), 1)
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_TOTAL_EXPOSURE ======
describe('maxTotalExposureRule', () => {
  it('allows when total BUY within limit', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 1000, 10), // 10_000
      mkIntent('600001', 'BUY', 2000, 10), // 20_000
    ])
    const r = maxTotalExposureRule.evaluate(
      plan,
      mkCtx({ equity: 1_000_000 }),
      10,
    )
    expect(r.kind).toBe('allow')
  })

  it('modifies to cap total BUY amount at limit', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100_000, 10), // 1_000_000
      mkIntent('600001', 'BUY', 50_000, 10), // 500_000
    ])
    const r = maxTotalExposureRule.evaluate(
      plan,
      mkCtx({ equity: 1_000_000 }),
      100,
    )
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      const total = r.changes.reduce((sum, c) => sum + c.targetAmount, 0)
      // integer flooring per intent loses ~10 from exact cap
      expect(total).toBeLessThanOrEqual(1_000_000)
      expect(total).toBeGreaterThanOrEqual(990_000)
    }
  })

  it('ignores SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1_000_000, 10)])
    const r = maxTotalExposureRule.evaluate(plan, mkCtx(), 1)
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_DRAWDOWN_STOP ======
describe('maxDrawdownStopRule', () => {
  it('allows when drawdown within limit', () => {
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 950_000, peakEquity: 1_000_000 }),
      10,
    )
    expect(r.kind).toBe('allow')
  })

  it('stops when drawdown exceeds limit', () => {
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 940_000, peakEquity: 1_000_000 }),
      5,
    )
    expect(r.kind).toBe('stop')
    if (r.kind === 'stop') {
      expect(r.reasonCode).toBe('MAX_DRAWDOWN_STOP')
      expect(r.reasonParams).toMatchObject({ pct: 6, limit: 5 })
    }
  })

  it('stops at exact boundary (>= limit)', () => {
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 950_000, peakEquity: 1_000_000 }),
      5,
    )
    expect(r.kind).toBe('stop')
  })

  it('allows when peakEquity is 0 (no history, defensive)', () => {
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 1_000_000, peakEquity: 0 }),
      5,
    )
    expect(r.kind).toBe('allow')
  })
})