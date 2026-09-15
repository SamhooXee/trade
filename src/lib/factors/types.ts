import type { DailyBar } from '@/lib/data'

/**
 * 因子参数定义。因子声明需要的参数、范围与默认值。
 */
export interface FactorParam {
  /** 参数 key,提交到 compute 时使用 */
  key: string
  /** 中文标签,用于 UI 展示 */
  label: string
  /** 英文标签 */
  labelEn: string
  /** 最小值(含) */
  min: number
  /** 最大值(含) */
  max: number
  /** 默认值 */
  default: number
}

/**
 * 因子定义。纯函数 + 元信息。
 */
export interface Factor {
  /** 唯一 id, 字符串字面量 */
  id: FactorId
  /** 中文标签 */
  label: string
  /** 英文标签 */
  labelEn: string
  /** 中文描述 */
  description: string
  /** 英文描述 */
  descriptionEn: string
  /** 因子参数定义 */
  params: FactorParam[]
  /**
   * 因子求值。bars 是按时间升序的日线数组(至少含 today 在内)。
   * 返回 number | null: null 表示数据不足(例如新股 lookback 不够)。
   */
  compute(bars: DailyBar[], params: Record<string, number>): number | null
}

export type FactorId =
  | 'RETURN_5D'
  | 'RETURN_20D'
  | 'RETURN_60D'
  | 'MA_CROSS'
  | 'VOLUME_RATIO'
  | 'PE_TTM'

/** 上下文: 因子求值时需要的额外信息(暂无, 留作未来扩展) */
export type FactorContext = Record<string, never>

/** 全部因子 id 列表,用于 zod 校验与 UI 下拉 */
export const FACTOR_IDS: FactorId[] = [
  'RETURN_5D',
  'RETURN_20D',
  'RETURN_60D',
  'MA_CROSS',
  'VOLUME_RATIO',
  'PE_TTM',
]