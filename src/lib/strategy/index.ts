// 公共 API
export type {
  StrategySpec,
  Condition,
  ConditionsBlock,
  Holding,
  Comparator,
  Combinator,
  StrategyStatus,
} from './types'
export type { FactorId } from '@/lib/factors'
export { COMPARATORS, COMBINATORS, STRATEGY_STATUSES } from './types'
export { composeStrategy, emptySpec, defaultHolding, parseStoredSpec } from './compose'
export { evaluateConditions } from './evaluate'
export { listStrategies, getStrategy, type StrategyRow } from './query'