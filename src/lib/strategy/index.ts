// 公共 API(纯类型 + 纯函数;server-only 模块不再经此处转发,避免被 client component 拖入 next/headers)
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
// listStrategies / getStrategy / StrategyRow 仅由 Server Component 直接 import '@/lib/strategy/query' 使用,不要在此处 re-export