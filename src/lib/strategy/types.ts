import { z } from 'zod'
import { FACTOR_IDS } from '@/lib/factors'

/**
 * 比较符。
 *  - '>' '<' '>=' '<=': 当前因子值与阈值比较
 *  - 'cross_up': 昨日 <= 阈值 且 今日 > 阈值
 *  - 'cross_down': 昨日 >= 阈值 且 今日 < 阈值
 */
export const COMPARATORS = ['>', '<', '>=', '<=', 'cross_up', 'cross_down'] as const
export type Comparator = (typeof COMPARATORS)[number]

export const COMBINATORS = ['AND', 'OR'] as const
export type Combinator = (typeof COMBINATORS)[number]

export const conditionSchema = z.object({
  factor: z.enum(FACTOR_IDS as [string, ...string[]]),
  params: z.record(z.string(), z.number()),
  comparator: z.enum(COMPARATORS),
  threshold: z.number(),
})

export const conditionsBlockSchema = z.object({
  combinator: z.enum(COMBINATORS),
  conditions: z.array(conditionSchema),
})

export const holdingSchema = z.object({
  maxPositions: z.number().int().min(1).max(50).default(5),
  positionSizePct: z.number().min(1).max(100).default(20),
  maxDrawdownPct: z.number().min(0.1).max(100).default(20),
})

export const strategySpecSchema = z.object({
  entry: conditionsBlockSchema,
  exit: conditionsBlockSchema,
  holding: holdingSchema,
})

export type Condition = z.infer<typeof conditionSchema>
export type ConditionsBlock = z.infer<typeof conditionsBlockSchema>
export type Holding = z.infer<typeof holdingSchema>
export type StrategySpec = z.infer<typeof strategySpecSchema>

/** 状态机:draft → active / paused → archived */
export const STRATEGY_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number]