// 时间区间选项,用于 /market/[symbol] 页面的 K 线时间窗。
// 业务起点 (all) 与 Phase 0 ingest 游标保持一致 (007_quant_ingest_setup.sql)。

export const PERIODS = ['1m', '3m', '6m', '1y', 'all'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_DEFAULT: Period = '3m'

/** 业务数据起始日 (Phase 0 cursor init) */
export const ALL_START_DATE = '2025-01-01'

/**
 * 解析 URL 上的 period 参数。无效或缺失时返回默认 3m。
 */
export function parsePeriod(input: string | undefined): Period {
  if (input && (PERIODS as readonly string[]).includes(input)) {
    return input as Period
  }
  return PERIOD_DEFAULT
}

/**
 * 给定 today,计算 period 对应的起始日 (闭区间左端)。
 * - '1m'/'3m'/'6m'/'1y': 相对 today 回退 N 天
 * - 'all': 业务起点 ALL_START_DATE
 */
const DAY_MS = 24 * 60 * 60 * 1000

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
}

export function periodStartDate(period: Period, today: Date): string {
  if (period === 'all') return ALL_START_DATE
  // 归一到 UTC 0 点,避免 today 的时分秒影响天数计算
  const todayUtcMidnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  const ts = todayUtcMidnight - PERIOD_DAYS[period] * DAY_MS
  return new Date(ts).toISOString().slice(0, 10)
}