// 行情数据接口。所有实现 (Mock / Tushare / AkShare) 必须满足这个形状。

export type Market = 'SH' | 'SZ'

export interface Symbol {
  /** 6 位股票代码,如 "600000" */
  code: string
  /** 交易所 */
  market: Market
  /** 中文名 */
  name: string
  /** 上市日期, ISO date string */
  listDate: string
  /** 退市日期,未退市为 null */
  delistDate: string | null
}

export interface DailyBar {
  symbolCode: string
  /** "YYYY-MM-DD" */
  tradeDate: string
  open: number
  high: number
  low: number
  close: number
  /** 股数 */
  volume: number
  /** 元 */
  amount: number
}

export interface MinuteBar {
  symbolCode: string
  /** "YYYY-MM-DD" */
  tradeDate: string
  /** ISO datetime,UTC */
  tradeTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number
}

export interface MarketDataProvider {
  /** 返回所有主板股票 (含已退市) */
  listSymbols(): Promise<Symbol[]>

  /** 历史日线,闭区间 [from, to] */
  getDailyBars(symbolCode: string, from: string, to: string): Promise<DailyBar[]>

  /** 历史分钟线,闭区间 [from, to] */
  getMinuteBars(symbolCode: string, from: string, to: string): Promise<MinuteBar[]>

  /** 增量日线,since 之后的所有日线 (含 since 当日) */
  getDailyBarsSince(symbolCode: string, since: string): Promise<DailyBar[]>

  /** 增量分钟线,since 之后的所有分钟线 (含 since) */
  getMinuteBarsSince(symbolCode: string, since: string): Promise<MinuteBar[]>
}