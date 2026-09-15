import type { Factor, FactorId } from './types'
import { RETURN_5D, RETURN_20D, RETURN_60D } from './momentum'
import { MA_CROSS } from './moving-average'
import { VOLUME_RATIO } from './volume'
import { PE_TTM } from './value'
import { FACTOR_IDS } from './types'

/** id → Factor 映射 */
export const FACTORS: Record<FactorId, Factor> = {
  RETURN_5D,
  RETURN_20D,
  RETURN_60D,
  MA_CROSS,
  VOLUME_RATIO,
  PE_TTM,
}

/** 按 id 查因子;未知 id 抛错。 */
export function getFactor(id: FactorId): Factor {
  const f = FACTORS[id]
  if (!f) throw new Error(`Unknown factor: ${id}`)
  return f
}

/** 列出全部因子(按 FACTOR_IDS 声明顺序),供 UI 下拉。 */
export function listFactors(): Factor[] {
  return FACTOR_IDS.map((id) => FACTORS[id])
}