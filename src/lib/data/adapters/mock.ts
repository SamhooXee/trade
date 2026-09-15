import type { DailyBar, MarketDataProvider, MinuteBar, Symbol } from '../provider'

/**
 * Mock 数据 provider。用确定性伪随机 (seed = symbolCode) 生成与 A 股形态
 * 相似但非真实的数据,仅用于本地开发与测试。
 *
 * 价格模型: 几何布朗运动 (drift 0.05%/日, vol 2%/日),开盘跳空。
 * 主板 ±10% 涨跌停限制硬约束。
 * 数据完全确定性: 相同输入永远返回相同输出。
 */

const TRADING_HOURS_UTC = [
  // 9:30-11:30 北京 = 1:30-3:30 UTC
  { start: { h: 1, m: 31 }, end: { h: 3, m: 30 }, count: 120 },
  // 13:00-15:00 北京 = 5:00-7:00 UTC
  { start: { h: 5, m: 1 }, end: { h: 7, m: 0 }, count: 120 },
]

const HOLIDAYS_2025 = new Set([
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-07',
  '2025-05-01', '2025-05-02', '2025-05-05',
  '2025-05-31', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
])

const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02',
  '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
])

function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  if (HOLIDAYS_2025.has(dateStr) || HOLIDAYS_2026.has(dateStr)) return false
  return true
}

function enumerateTradingDays(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    if (isTradingDay(dateStr)) result.push(dateStr)
  }
  return result
}

/** 简单 seeded RNG (Mulberry32 变体,字符串 hash → seed) */
function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 标准正态分布采样 (Box-Muller 简化) */
function randNormal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9)
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** 主板代码集合 (沪 6xxxxx + 深 00xxxxx / 002xxx / 003xxx) */
function enumerateMainboardCodes(): string[] {
  const codes: string[] = []
  // 沪市主板 600000-601999 (2000), 603000-603999 (1000)
  for (let i = 0; i < 2000; i++) codes.push('6' + String(i).padStart(5, '0'))
  for (let i = 3000; i < 4000; i++) codes.push('6' + String(i).padStart(5, '0'))
  // 深市主板 000001-001999 (1999), 002001-002999 (999), 003001-003999 (999)
  for (let i = 1; i < 2000; i++) codes.push('0' + String(i).padStart(5, '0'))
  for (let i = 2001; i < 3000; i++) codes.push('0' + String(i).padStart(5, '0'))
  for (let i = 3001; i < 4000; i++) codes.push('0' + String(i).padStart(5, '0'))
  return codes
}

const MAINBOARD_CODES = enumerateMainboardCodes()

const SAMPLE_NAMES = [
  '浦发银行', '招商银行', '兴业银行', '中信证券', '贵州茅台', '五粮液', '中国平安',
  '万科A', '保利发展', '海螺水泥', '宝钢股份', '中国石化', '中国石油', '上汽集团',
  '中国神华', '长江电力', '美的集团', '格力电器', '海尔智家', '伊利股份',
]

export class MockDataProvider implements MarketDataProvider {
  async listSymbols(): Promise<Symbol[]> {
    return MAINBOARD_CODES.map((code) => {
      const market = code.startsWith('6') ? 'SH' : 'SZ'
      const rand = seededRandom('name:' + code)
      const name = SAMPLE_NAMES[Math.floor(rand() * SAMPLE_NAMES.length)]
      return {
        code,
        market,
        name,
        listDate: '1999-01-01',
        delistDate: null,
      }
    })
  }

  async getDailyBars(symbolCode: string, from: string, to: string): Promise<DailyBar[]> {
    const dates = enumerateTradingDays(from, to)
    // 序列生成: 每天的开盘相对前一日的收盘跳空, 形成真实的 ±10% 约束链条
    let prevClose = this.basePriceFor(symbolCode)
    return dates.map((date) => {
      const bar = this.makeDailyBar(symbolCode, date, prevClose)
      prevClose = bar.close
      return bar
    })
  }

  async getMinuteBars(symbolCode: string, from: string, to: string): Promise<MinuteBar[]> {
    const dates = enumerateTradingDays(from, to)
    const result: MinuteBar[] = []
    for (const date of dates) {
      result.push(...this.makeMinuteBars(symbolCode, date))
    }
    return result
  }

  async getDailyBarsSince(symbolCode: string, since: string): Promise<DailyBar[]> {
    const today = new Date().toISOString().slice(0, 10)
    return this.getDailyBars(symbolCode, since, today)
  }

  async getMinuteBarsSince(symbolCode: string, since: string): Promise<MinuteBar[]> {
    const today = new Date().toISOString().slice(0, 10)
    return this.getMinuteBars(symbolCode, since, today)
  }

  private makeDailyBar(symbolCode: string, date: string, prevClose: number): DailyBar {
    const rand = seededRandom(`${symbolCode}:${date}`)

    // GBM 跳空 + 收盘
    const drift = 0.0005
    const vol = 0.02
    const gap = (rand() - 0.5) * 0.04 // ±2% 跳空
    const openRatio = 1 + gap
    let open = prevClose * openRatio
    // 涨跌停钳制
    open = this.applyLimit(open, prevClose)
    const closeRand = randNormal(rand)
    let close = open * Math.exp(drift - 0.5 * vol * vol + vol * closeRand)
    close = this.applyLimit(close, prevClose)

    const high = Math.max(open, close) * (1 + Math.abs(randNormal(rand)) * 0.005)
    const low = Math.min(open, close) * (1 - Math.abs(randNormal(rand)) * 0.005)

    const volume = Math.floor(1_000_000 + rand() * 9_000_000)
    const amount = Math.floor(volume * (open + close) / 2)

    return {
      symbolCode,
      tradeDate: date,
      open: round4(open),
      high: round4(high),
      low: round4(low),
      close: round4(close),
      volume,
      amount,
    }
  }

  private makeMinuteBars(symbolCode: string, date: string): MinuteBar[] {
    const dayBar = this.makeDailyBar(symbolCode, date, this.basePriceFor(symbolCode))
    const result: MinuteBar[] = []
    let prevClose = (dayBar.open + dayBar.close) / 2

    for (const session of TRADING_HOURS_UTC) {
      for (let i = 0; i < session.count; i++) {
        const minutes = session.start.m + i
        const h = session.start.h + Math.floor(minutes / 60)
        const m = minutes % 60
        const tradeTime = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

        const rand = seededRandom(`${symbolCode}:${tradeTime}`)
        const drift = 0.00001
        const vol = 0.001
        const close = prevClose * Math.exp(drift - 0.5 * vol * vol + vol * randNormal(rand))
        const open = prevClose
        const high = Math.max(open, close) * (1 + Math.abs(randNormal(rand)) * 0.001)
        const low = Math.min(open, close) * (1 - Math.abs(randNormal(rand)) * 0.001)
        const volume = Math.floor(5_000 + rand() * 50_000)

        result.push({
          symbolCode,
          tradeDate: date,
          tradeTime,
          open: round4(open),
          high: round4(high),
          low: round4(low),
          close: round4(close),
          volume,
          amount: Math.floor(volume * (open + close) / 2),
        })
        prevClose = close
      }
    }
    return result
  }

  private basePriceFor(symbolCode: string): number {
    const rand = seededRandom(`${symbolCode}:genesis`)
    return 10 + rand() * 50 // 10-60 元随机基础价
  }

  private applyLimit(price: number, prevClose: number): number {
    const upper = prevClose * 1.10
    const lower = prevClose * 0.90
    return Math.max(lower, Math.min(upper, price))
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}