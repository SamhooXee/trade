import type {
  Portfolio,
  Position,
  RebalanceIntent,
  RebalancePlan,
} from '@/lib/trading'

/** 规则求值后的决策(沿用 spec §6.6) */
export type RiskAction =
  | { kind: 'allow' }
  | { kind: 'modify'; changes: RebalanceIntent[]; reasonCode: string }
  | { kind: 'reject'; reasonCode: string; reasonParams?: Record<string, unknown> }
  | { kind: 'stop'; reasonCode: string; reasonParams?: Record<string, unknown> }

/** 规则的输入上下文(由 riskEngine 准备) */
export interface RiskContext {
  /** 当前 portfolio(只读) */
  portfolio: Portfolio
  /** 当前持仓(只读) */
  positions: Position[]
  /** 持仓按 symbol 索引 */
  positionsBySymbol: Map<string, Position>
  /** 现金(从 portfolio.cash 复制一份方便 modify) */
  cash: number
  /** 总权益 = cash + Σ(shares × lastClose) */
  equity: number
  /** 历史 peak equity(MAX(equity_snapshots.equity) + 当前 equity) */
  peakEquity: number
  /** 当日 trade_date(YYYY-MM-DD) */
  today: string
  /** 当前规则之前的 modify 累计(允许链条 modify) */
  appliedModifies: RebalanceIntent[]
}

/** 单条规则 id(供 i18n / 日志引用) */
export type RiskRuleId =
  | 'INSUFFICIENT_BUYING_POWER'
  | 'INSUFFICIENT_SELLABLE_SHARES'
  | 'MAX_POSITION_PCT'
  | 'MAX_POSITIONS'
  | 'MAX_TOTAL_EXPOSURE'
  | 'MAX_DRAWDOWN_STOP'

/** 单条规则接口 */
export interface RiskRule {
  /** 规则的稳定 id(供 i18n / 日志引用) */
  id: RiskRuleId
  /** 求值 */
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction
}

/** 引擎一次求值的结果(给 strategy_run_log 记录) */
export interface RiskDecisionLog {
  ruleId: RiskRuleId
  action: RiskAction['kind']
  reasonCode: string | null
  at: string  // ISO 时间
}

/** 引擎总结果 */
export interface RiskEvaluationResult {
  /** 最终 plan.intents(modify 链全部应用后) */
  finalIntents: RebalanceIntent[]
  /** 是否触发 stop */
  stopped: boolean
  /** stop 的 reasonCode(若 stopped=true) */
  stopReasonCode: string | null
  /** 每条规则的执行日志(供 UI 显示与日志分析) */
  log: RiskDecisionLog[]
}