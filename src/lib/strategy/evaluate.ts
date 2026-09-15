import { getFactor } from '@/lib/factors'
import type { DailyBar } from '@/lib/data'
import type { Comparator, ConditionsBlock } from './types'

/**
 * 对**一只股票**评估 conditions 块。返回 boolean。
 * bars 升序,至少包含 today 在内;因子求值用末段数据。
 *
 * 比较符语义:
 *  - '>': factorValue > threshold
 *  - '<': factorValue < threshold
 *  - '>=': factorValue >= threshold
 *  - '<=': factorValue <= threshold
 *  - 'cross_up': 昨日 <= 阈值 且 今日 > 阈值
 *  - 'cross_down': 昨日 >= 阈值 且 今日 < 阈值
 *
 * 因子返回 null(数据不足)视为"不满足"。
 */
export function evaluateConditions(
  block: ConditionsBlock,
  bars: DailyBar[],
): boolean {
  const { combinator, conditions } = block
  if (conditions.length === 0) return combinator === 'AND'

  const results = conditions.map((c) => matchOne(c, bars))
  return combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

function matchOne(
  c: { factor: string; params: Record<string, number>; comparator: Comparator; threshold: number },
  bars: DailyBar[],
): boolean {
  // c.factor 来自 strategy spec JSON,运行时由 zod 限制为 FactorId;此处强制为合法 id。
  const factor = getFactor(c.factor as Parameters<typeof getFactor>[0])
  const todayVal = factor.compute(bars, c.params)
  if (todayVal === null) return false

  switch (c.comparator) {
    case '>':
      return todayVal > c.threshold
    case '<':
      return todayVal < c.threshold
    case '>=':
      return todayVal >= c.threshold
    case '<=':
      return todayVal <= c.threshold
    case 'cross_up': {
      if (bars.length < 2) return false
      const prevBars = bars.slice(0, -1)
      const prevVal = factor.compute(prevBars, c.params)
      if (prevVal === null) return false
      return prevVal <= c.threshold && todayVal > c.threshold
    }
    case 'cross_down': {
      if (bars.length < 2) return false
      const prevBars = bars.slice(0, -1)
      const prevVal = factor.compute(prevBars, c.params)
      if (prevVal === null) return false
      return prevVal >= c.threshold && todayVal < c.threshold
    }
  }
}