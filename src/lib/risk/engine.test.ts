import { describe, it, expect } from 'vitest'
import { evaluateRisk } from './engine'
import type { RiskContext } from './types'
import type {
  RebalancePlan,
  RebalanceIntent,
  Portfolio,
  Position,
  StrategySpec,
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

const baseSpec: StrategySpec = {
  entry: { combinator: 'AND', conditions: [] },
  exit: { combinator: 'OR', conditions: [] },
  holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 },
}

describe('evaluateRisk', () => {
  it('returns finalIntents unchanged when all rules allow', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1000, 10)] }
    const r = evaluateRisk({ plan, ctx: mkCtx({ cash: 1_000_000 }), spec: baseSpec })
    expect(r.stopped).toBe(false)
    expect(r.finalIntents).toEqual(plan.intents)
    expect(r.log.length).toBe(6) // 6 rules
    expect(r.log.every((l) => l.action === 'allow')).toBe(true)
  })

  it('chains modify: positionPct caps single share', () => {
    const plan: RebalancePlan = {
      intents: [
        mkIntent('600000', 'BUY', 100_000, 10), // 1_000_000 (over 25%)
        mkIntent('600001', 'BUY', 100_000, 10), // 1_000_000
      ],
    }
    const r = evaluateRisk({
      plan,
      ctx: mkCtx({ cash: 10_000_000, equity: 1_000_000 }),
      spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 } },
    })
    expect(r.stopped).toBe(false)
    // positionPct: 每笔 25% × 1_000_000 = 250_000 / 10 = 25_000 shares
    expect(r.finalIntents[0].shares).toBe(25_000)
    expect(r.finalIntents[1].shares).toBe(25_000)
    expect(r.log.some((l) => l.action === 'modify' && l.reasonCode === 'MAX_POSITION_PCT')).toBe(true)
  })

  it('short-circuits on first reject and skips subsequent rules', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1_000_000, 10)] }
    const r = evaluateRisk({ plan, ctx: mkCtx({ cash: 100 }), spec: baseSpec })
    expect(r.stopped).toBe(false)
    expect(r.finalIntents).toEqual(plan.intents) // reject 不改 plan
    expect(r.log.some((l) => l.action === 'reject')).toBe(true)
  })

  it('short-circuits on stop and returns unmodified plan', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1000, 10)] }
    const r = evaluateRisk({
      plan,
      ctx: mkCtx({ equity: 800_000, peakEquity: 1_000_000 }), // drawdown 20%
      spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 } },
    })
    expect(r.stopped).toBe(true)
    expect(r.stopReasonCode).toBe('MAX_DRAWDOWN_STOP')
    // stop 后引擎不再跑后续规则,但 finalIntents 仍为 plan(给上层"丢弃全部"信号)
    expect(r.log[0].action).toBe('allow')
    expect(r.log.some((l) => l.action === 'stop')).toBe(true)
  })

  it('applies each modify with the updated plan (chained)', () => {
    // positionPct 改后,后续规则看到的是改过的 plan
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 30_000, 10)] }
    const r = evaluateRisk({
      plan,
      ctx: mkCtx({ cash: 1_000_000, equity: 1_000_000 }),
      spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 10, maxDrawdownPct: 50 } },
    })
    // 10% cap → 100_000 → 10_000 shares
    expect(r.finalIntents[0].shares).toBe(10_000)
    expect(r.log.filter((l) => l.action === 'modify').length).toBeGreaterThanOrEqual(1)
  })
})