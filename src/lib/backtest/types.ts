import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

/** 回测输入 */
export interface BacktestInput {
  /** 待回测的策略 spec(已 compose 过的完整 spec) */
  spec: StrategySpec
  /** 回测起始交易日(包含) */
  startDate: string  // 'YYYY-MM-DD'
  /** 回测结束交易日(包含) */
  endDate: string
  /** 初始资金(元) */
  initialCash: number
  /** 候选股票池;不传则全主板 */
  symbols?: string[]
  /** 撮合费率(可选覆盖,默认 A 股简化版) */
  fees?: FeeConfig
}

/** 费率配置 */
export interface FeeConfig {
  /** 佣金率,默认 0.00025 */
  commissionRate?: number
  /** 佣金最低,默认 5 元 */
  commissionMin?: number
  /** 印花税率(SELL),默认 0.001 */
  stampTaxRate?: number
}

/** 单笔成交(回测产出) */
export interface Trade {
  /** 成交日期(实际撮合日 = 调仓日 + 1 交易日) */
  date: string
  symbolCode: string
  side: 'BUY' | 'SELL'
  /** 成交价格 */
  price: number
  /** 成交股数(已整手化) */
  shares: number
  /** 成交金额 = price × shares */
  amount: number
  /** 总费用(佣金 + 印花税) */
  fee: number
}

/** 单日权益点 */
export interface EquityPoint {
  date: string
  /** 当时权益 = 现金 + 持仓市值(以当日收盘价计) */
  equity: number
}

/** 5 个核心指标 */
export interface Metrics {
  totalReturn: number       // 总收益率 (小数, +0.123 = +12.3%)
  annualizedReturn: number  // 年化收益率
  maxDrawdown: number       // 最大回撤 (负数或 0)
  sharpeRatio: number       // 夏普比率 (rf=0)
  winRate: number           // 胜率 (0~1)
  totalTrades: number       // 总交易笔数 (BUY+SELL 合计)
  avgHoldingDays: number    // 平均持仓天数
}

/** 回测输出 */
export interface BacktestOutput {
  initialCash: number
  finalEquity: number
  metrics: Metrics
  trades: Trade[]
  equityCurve: EquityPoint[]
}

/** 单只股票持仓(引擎内部状态) */
export interface Position {
  symbolCode: string
  shares: number       // 当前持仓
  costPrice: number    // 平均成本(简化:仅最近一次 BUY 价;不重复加仓)
  entryDate: string    // 入场日期(用于算持仓天数)
}

/** 单只股票的调仓意图(引擎内部) */
export interface RebalanceIntent {
  symbolCode: string
  side: 'BUY' | 'SELL'
  /** 目标金额(BUY:目标成交金额;SELL:目标卖出金额) */
  targetAmount: number
}

/** 撮合请求(传入 fills.ts) */
export interface FillRequest {
  intent: RebalanceIntent
  /** 下一交易日 bar(用 open 撮合) */
  nextBar: DailyBar
  /** SELL 时:当前可用股数 */
  availableShares?: number
  /** BUY 时:当前可用现金 */
  availableCash?: number
}

/** 撮合结果 */
export interface FillResult {
  status: 'filled' | 'rejected'
  reason?: string
  trade?: Trade
}