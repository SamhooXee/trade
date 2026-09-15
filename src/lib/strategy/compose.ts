import { strategySpecSchema, type StrategySpec, type Holding } from './types'

/** 默认持仓配置 */
export function defaultHolding(): Holding {
  return { maxPositions: 5, positionSizePct: 20, maxDrawdownPct: 20 }
}

/** 全新空 spec,UI 初始化时使用 */
export function emptySpec(): StrategySpec {
  return {
    entry: { combinator: 'AND', conditions: [] },
    exit: { combinator: 'OR', conditions: [] },
    holding: defaultHolding(),
  }
}

/**
 * 校验 + 填充默认值。输入可以是部分 (holding 字段缺失),输出是完整的 StrategySpec。
 * 失败抛 zod 错误(沿用 zod 的 Error 形状)。
 */
export function composeStrategy(input: unknown): StrategySpec {
  return strategySpecSchema.parse(input)
}

/** DB JSONB 字段直接是 StrategySpec,这里仅做 schema 校验 */
export function parseStoredSpec(raw: unknown): StrategySpec {
  return strategySpecSchema.parse(raw)
}