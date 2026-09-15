import type { DailyBar } from '@/lib/data'

/**
 * 简单收益率: (今天收盘 - N 天前收盘) / N 天前收盘。
 * bars 升序,取最后 N+1 个 bar。
 */
export function simpleReturn(bars: DailyBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const today = bars[bars.length - 1].close
  const past = bars[bars.length - 1 - period].close
  if (past === 0) return null
  return (today - past) / past
}

/**
 * 简单移动平均: 末 N 个 close 的算术平均。
 */
export function ma(bars: DailyBar[], period: number): number | null {
  if (bars.length < period) return null
  const slice = bars.slice(-period)
  const sum = slice.reduce((acc, b) => acc + b.close, 0)
  return sum / period
}

/**
 * 量比: 今日成交量 / 过去 N 日平均成交量(不含今日)。
 */
export function volumeRatio(bars: DailyBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const today = bars[bars.length - 1].volume
  const past = bars.slice(-(period + 1), -1)
  const sum = past.reduce((acc, b) => acc + b.volume, 0)
  const avg = sum / period
  if (avg === 0) return null
  return today / avg
}