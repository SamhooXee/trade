// A 股交易日历。节假日表硬编码,每年 12 月从国务院办公厅通知更新。

const HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-07',
  '2025-05-01', '2025-05-02', '2025-05-05',
  '2025-05-31', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026
  '2026-01-01', '2026-01-02',
  '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
])

/** "YYYY-MM-DD" 是否为交易日 (周末与节假日均非交易日) */
export function isTradingDay(date: string): boolean {
  const d = new Date(date + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !HOLIDAYS.has(date)
}

/** 给定日期的下一个交易日 (含给定的 next) */
export function nextTradingDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  let s = d.toISOString().slice(0, 10)
  while (!isTradingDay(s)) {
    d.setUTCDate(d.getUTCDate() + 1)
    s = d.toISOString().slice(0, 10)
  }
  return s
}

/** 给定日期的上一个交易日 */
export function prevTradingDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  let s = d.toISOString().slice(0, 10)
  while (!isTradingDay(s)) {
    d.setUTCDate(d.getUTCDate() - 1)
    s = d.toISOString().slice(0, 10)
  }
  return s
}

/** 返回 [from, to] 闭区间内的所有交易日, 升序 */
export function getTradingDays(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  if (start > end) return result
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10)
    if (isTradingDay(s)) result.push(s)
  }
  return result
}