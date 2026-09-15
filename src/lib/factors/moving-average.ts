import type { Factor } from './types'
import { ma } from './helpers'

/**
 * MA_CROSS: 因子值 = 短期均线 - 长期均线。
 * 正值表示短期均线在长期均线上方(多头); 负值表示空头。
 * `cross_up` / `cross_down` 比较符在 evaluate.ts 中基于本因子的"昨日值"判断。
 */
export const MA_CROSS: Factor = {
  id: 'MA_CROSS',
  label: '均线差值',
  labelEn: 'MA Difference',
  description: '快线均线减去慢线均线(正值为多头,负值为空头)',
  descriptionEn: 'Fast MA minus slow MA (positive = bullish, negative = bearish)',
  params: [
    { key: 'fastPeriod', label: '快线周期', labelEn: 'Fast Period', min: 2, max: 60, default: 5 },
    { key: 'slowPeriod', label: '慢线周期', labelEn: 'Slow Period', min: 5, max: 250, default: 20 },
  ],
  compute: (bars, params) => {
    const fast = ma(bars, params.fastPeriod)
    const slow = ma(bars, params.slowPeriod)
    if (fast === null || slow === null) return null
    return fast - slow
  },
}