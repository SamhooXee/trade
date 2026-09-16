// 公共 API
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
export {
  listBacktestRuns,
  listBacktestRunsByStrategy,
  getBacktestRun,
  type BacktestRunRow,
} from './query'
export { createBacktestRunAction, type BacktestFormState } from './actions'