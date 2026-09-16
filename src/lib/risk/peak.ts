import type { EquitySnapshot, Portfolio } from '@/lib/trading'

/** peak.ts 的输入 */
export interface ComputePeakEquityInput {
  portfolio: Portfolio
  /** 当前权益(实时计算:cash + Σ(shares × lastClose)) */
  currentEquity: number
  /** 历史 snapshot 列表(已按 trade_date DESC 排序,或任意顺序) */
  snapshots: EquitySnapshot[]
}

/**
 * 计算 peak equity:
 *   peak = MAX(MAX(snapshots.equity), currentEquity)
 *
 * 用于 MAX_DRAWDOWN_STOP 规则:回撤 = (currentEquity - peak) / peak。
 */
export function computePeakEquity(input: ComputePeakEquityInput): number {
  const { currentEquity, snapshots } = input
  let peak = currentEquity
  for (const s of snapshots) {
    if (s.equity > peak) peak = s.equity
  }
  return peak
}