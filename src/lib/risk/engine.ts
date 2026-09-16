import {
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
} from './rules'
import type { RiskContext, RiskDecisionLog, RiskEvaluationResult } from './types'
import type {
  RebalancePlan,
  RebalanceIntent,
  StrategySpec,
} from '@/lib/trading'

export interface EvaluateRiskInput {
  plan: RebalancePlan
  ctx: RiskContext
  spec: StrategySpec
}

/**
 * 顺序求值规则,带短路:
 *   1. INSUFFICIENT_BUYING_POWER
 *   2. INSUFFICIENT_SELLABLE_SHARES
 *   3. MAX_POSITION_PCT (modify)
 *   4. MAX_POSITIONS
 *   5. MAX_TOTAL_EXPOSURE (modify)
 *   6. MAX_DRAWDOWN_STOP (stop)
 *
 * modify 链:每条规则的 modify 都基于上一条的 finalIntents 计算。
 * reject:跳过剩余规则,finalIntents 保持 reject 之前的值(给上层"丢弃全部"信号)。
 * stop:同上,但 stopped=true。
 */
export function evaluateRisk(input: EvaluateRiskInput): RiskEvaluationResult {
  const { plan, ctx, spec } = input
  const { maxPositions, positionSizePct, maxDrawdownPct } = spec.holding

  let currentIntents: RebalanceIntent[] = plan.intents
  const log: RiskDecisionLog[] = []
  const now = new Date().toISOString()

  function record(
    action: RiskDecisionLog['action'],
    ruleId: RiskDecisionLog['ruleId'],
    reasonCode: string | null,
  ) {
    log.push({ ruleId, action, reasonCode, at: now })
  }

  // 1. INSUFFICIENT_BUYING_POWER
  let r = insufficientBuyingPowerRule.evaluate({ intents: currentIntents }, ctx)
  record(
    r.kind,
    'INSUFFICIENT_BUYING_POWER',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )
  if (r.kind === 'reject')
    return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 2. INSUFFICIENT_SELLABLE_SHARES
  r = insufficientSellableSharesRule.evaluate({ intents: currentIntents }, ctx)
  record(
    r.kind,
    'INSUFFICIENT_SELLABLE_SHARES',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )
  if (r.kind === 'reject')
    return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 3. MAX_POSITION_PCT (modify)
  r = maxPositionPctRule.evaluate({ intents: currentIntents }, ctx, positionSizePct)
  record(
    r.kind,
    'MAX_POSITION_PCT',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )
  if (r.kind === 'modify') currentIntents = r.changes
  if (r.kind === 'reject')
    return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 4. MAX_POSITIONS
  r = maxPositionsRule.evaluate({ intents: currentIntents }, ctx, maxPositions)
  record(
    r.kind,
    'MAX_POSITIONS',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )
  if (r.kind === 'reject')
    return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 5. MAX_TOTAL_EXPOSURE (modify) — 硬编码 100% 上限(本期不做 spec 配置)
  r = maxTotalExposureRule.evaluate({ intents: currentIntents }, ctx, 100)
  record(
    r.kind,
    'MAX_TOTAL_EXPOSURE',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )
  if (r.kind === 'modify') currentIntents = r.changes
  if (r.kind === 'reject')
    return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 6. MAX_DRAWDOWN_STOP (stop)
  r = maxDrawdownStopRule.evaluate({ intents: currentIntents }, ctx, maxDrawdownPct)
  if (r.kind === 'stop') {
    record('stop', 'MAX_DRAWDOWN_STOP', r.reasonCode)
    return {
      finalIntents: currentIntents,
      stopped: true,
      stopReasonCode: r.reasonCode,
      log,
    }
  }
  record(
    r.kind,
    'MAX_DRAWDOWN_STOP',
    r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode,
  )

  return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }
}