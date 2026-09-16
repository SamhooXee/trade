// 公共 API(纯类型 + 纯函数;server-only 模块不再经此处转发,避免被 client component 拖入 next/headers)
// - listBacktestRuns / getBacktestRun / BacktestRunRow 仅由 Server Component 直接 import '@/lib/backtest/query'
// - createBacktestRunAction 仅由 Client Component 直接 import '@/lib/backtest/actions'
export type {
  BacktestInput,
  BacktestOutput,
  Trade,
  EquityPoint,
  Metrics,
  FeeConfig,
  Position,
  RebalanceIntent,
} from './types'
export { matchFill, computeFee, DEFAULT_FEE_CONFIG, LIMIT_PCT, LOT_SIZE } from './fills'
export { computeMetrics } from './metrics'
export { runBacktest } from './engine'