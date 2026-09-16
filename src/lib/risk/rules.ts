import type { RiskContext, RiskRule, RiskAction } from './types'
import type { RebalanceIntent, RebalancePlan } from '@/lib/trading'

// ============================================================
// INSUFFICIENT_BUYING_POWER
// ============================================================
/** 校验所有 BUY intent 的 targetAmount 之和 ≤ cash。 */
export const insufficientBuyingPowerRule: RiskRule = {
  id: 'INSUFFICIENT_BUYING_POWER',
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction {
    let usedCash = 0
    for (const i of plan.intents) {
      if (i.side !== 'BUY') continue
      usedCash += i.targetAmount
      if (usedCash > ctx.cash) {
        return { kind: 'reject', reasonCode: 'INSUFFICIENT_BUYING_POWER' }
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// INSUFFICIENT_SELLABLE_SHARES
// ============================================================
/** 校验所有 SELL intent 的 shares ≤ position.availableShares。 */
export const insufficientSellableSharesRule: RiskRule = {
  id: 'INSUFFICIENT_SELLABLE_SHARES',
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction {
    for (const i of plan.intents) {
      if (i.side !== 'SELL') continue
      const pos = ctx.positionsBySymbol.get(i.symbolCode)
      const available = pos?.availableShares ?? 0
      const requestedShares = i.shares ?? Math.floor(i.targetAmount / (i.intendedPrice ?? 1))
      if (requestedShares > available) {
        return {
          kind: 'reject',
          reasonCode: 'INSUFFICIENT_SELLABLE_SHARES',
          reasonParams: {
            symbolCode: i.symbolCode,
            requested: requestedShares,
            available,
          },
        }
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// MAX_POSITION_PCT (modify)
// ============================================================
/** 单仓位 BUY 金额 ≤ equity × limitPct。超出的 BUY 缩到 limit(整数股,向下取整)。 */
export const maxPositionPctRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_POSITION_PCT',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    const cap = ctx.equity * (limitPct / 100)
    let changed = false
    const changes: RebalanceIntent[] = plan.intents.map((i) => {
      if (i.side !== 'BUY') return i
      if (i.targetAmount <= cap) return i
      changed = true
      const price = i.intendedPrice ?? 1
      const newShares = Math.floor(cap / price)
      return { ...i, shares: newShares, targetAmount: newShares * price }
    })
    return changed
      ? { kind: 'modify', changes, reasonCode: 'MAX_POSITION_PCT' }
      : { kind: 'allow' }
  },
}

// ============================================================
// MAX_POSITIONS (reject)
// ============================================================
/** 已持仓 + 新 BUY intent 中不同 symbol 数 > limit → reject。
 *  本期:不裁剪,直接 reject(简化)。SELL 不算新仓位。 */
export const maxPositionsRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limit: number): RiskAction
} = {
  id: 'MAX_POSITIONS',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limit: number): RiskAction {
    const existingSymbols = new Set(ctx.positions.map((p) => p.symbolCode))
    const newBuySymbols = new Set<string>()
    for (const i of plan.intents) {
      if (i.side === 'BUY') newBuySymbols.add(i.symbolCode)
    }
    const totalAfter = new Set([...existingSymbols, ...newBuySymbols]).size
    if (totalAfter > limit) {
      return {
        kind: 'reject',
        reasonCode: 'MAX_POSITIONS',
        reasonParams: { count: totalAfter, limit },
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// MAX_TOTAL_EXPOSURE (modify)
// ============================================================
/** 所有 BUY amount 之和 ≤ equity × limitPct。超出则等比缩放。 */
export const maxTotalExposureRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_TOTAL_EXPOSURE',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    const buys = plan.intents.filter((i) => i.side === 'BUY')
    if (buys.length === 0) return { kind: 'allow' }
    const totalAmount = buys.reduce((sum, i) => sum + i.targetAmount, 0)
    const cap = ctx.equity * (limitPct / 100)
    if (totalAmount <= cap) return { kind: 'allow' }
    const scale = cap / totalAmount
    const changes: RebalanceIntent[] = plan.intents.map((i) => {
      if (i.side !== 'BUY') return i
      const price = i.intendedPrice ?? 1
      const newShares = Math.floor((i.shares ?? Math.floor(i.targetAmount / price)) * scale)
      return {
        ...i,
        shares: newShares,
        targetAmount: newShares * price,
      }
    })
    return { kind: 'modify', changes, reasonCode: 'MAX_TOTAL_EXPOSURE' }
  },
}

// ============================================================
// MAX_DRAWDOWN_STOP (stop)
// ============================================================
/** (currentEquity - peakEquity) / peakEquity < -limitPct → stop。 */
export const maxDrawdownStopRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_DRAWDOWN_STOP',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    if (ctx.peakEquity <= 0) return { kind: 'allow' }
    const drawdownPct = ((ctx.equity - ctx.peakEquity) / ctx.peakEquity) * 100
    if (drawdownPct <= -limitPct) {
      return {
        kind: 'stop',
        reasonCode: 'MAX_DRAWDOWN_STOP',
        reasonParams: {
          pct: Math.round(-drawdownPct * 100) / 100,
          limit: limitPct,
        },
      }
    }
    return { kind: 'allow' }
  },
}

/** 6 条规则的导出数组(供 riskEngine 使用) */
export const ALL_RULES = [
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
] as const