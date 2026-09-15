// A 股交易时段工具。
// 时区约定: Vercel Cron 与数据库使用 UTC; 业务时间(开盘/收盘等)按北京时间 UTC+8。
// 北京时间不变实行夏令时,UTC↔北京 永远相差 8 小时。

export type Session = 'pre_market' | 'morning' | 'lunch' | 'afternoon' | 'post_market'

const SESSION_BOUNDS_UTC_MIN = {
  morningOpen: 1 * 60 + 30,   // 9:30 北京 = 1:30 UTC
  morningClose: 3 * 60 + 30,  // 11:30 北京 = 3:30 UTC
  afternoonOpen: 5 * 60 + 1,  // 13:01 北京 = 5:01 UTC (cron 在 5:00 触发后)
  afternoonClose: 7 * 60,     // 15:00 北京 = 7:00 UTC
}

/**
 * 返回给定 UTC 时刻所处的 A 股时段。
 * 注意: 周末与节假日也由 getSession 返回具体时段;是否交易日由 trading-day 模块判断。
 * 时段边界包含闭端点: 9:30/11:30/13:01/15:00 这些分钟点属于前一个时段。
 */
export function getSession(date: Date): Session {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  if (minutes < SESSION_BOUNDS_UTC_MIN.morningOpen) return 'pre_market'
  if (minutes <= SESSION_BOUNDS_UTC_MIN.morningClose) return 'morning'
  if (minutes < SESSION_BOUNDS_UTC_MIN.afternoonOpen) return 'lunch'
  if (minutes <= SESSION_BOUNDS_UTC_MIN.afternoonClose) return 'afternoon'
  return 'post_market'
}

/** UTC Date → 北京时间 Date (内部仍用 UTC 字段,含义为北京时间) */
export function toBeijingTime(utc: Date): Date {
  return new Date(utc.getTime() + 8 * 60 * 60 * 1000)
}

/** 北京时间 Date (用 UTC 字段表示) → UTC Date */
export function toUtcTime(beijing: Date): Date {
  return new Date(beijing.getTime() - 8 * 60 * 60 * 1000)
}