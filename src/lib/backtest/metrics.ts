import type { EquityPoint, Metrics, Trade } from './types'

interface ComputeMetricsInput {
  initialCash: number
  equityCurve: EquityPoint[]
  trades: Trade[]
}

/** 一年交易日(沿用 spec §3 / A 股惯例) */
const TRADING_DAYS_PER_YEAR = 252

/**
 * 由 equity 序列计算总收益、年化、最大回撤、夏普。
 */
export function computeMetrics(input: ComputeMetricsInput): Metrics {
  const { initialCash, equityCurve, trades } = input

  const finalEquity = equityCurve.length > 0
    ? equityCurve[equityCurve.length - 1].equity
    : initialCash

  const totalReturn = (finalEquity - initialCash) / initialCash
  const tradingDays = Math.max(equityCurve.length - 1, 0)
  const annualizedReturn = tradingDays === 0
    ? 0
    : Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / tradingDays) - 1

  // 最大回撤
  let peak = -Infinity
  let maxDD = 0
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity
    if (peak > 0) {
      const dd = (p.equity - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
  }

  // 夏普(基于日收益率;rf=0)
  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity
    if (prev > 0) {
      dailyReturns.push((equityCurve[i].equity - prev) / prev)
    }
  }
  let sharpeRatio = 0
  if (dailyReturns.length > 1) {
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    const variance =
      dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length
    const std = Math.sqrt(variance)
    sharpeRatio = std === 0 ? 0 : (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR)
  }

  // 胜率与平均持仓天数(基于 BUY→SELL 回合)
  const { winRate, avgHoldingDays } = computeRoundTripStats(trades)

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown: maxDD,
    sharpeRatio,
    winRate,
    totalTrades: trades.length,
    avgHoldingDays,
  }
}

interface RoundTripStats {
  winRate: number
  avgHoldingDays: number
}

/**
 * 按 symbol 配对 BUY → 后续 SELL(取首次配对,简化)。
 * 一笔回合 = (BUY price, SELL price, SELL date - BUY date)。
 */
function computeRoundTripStats(trades: Trade[]): RoundTripStats {
  const openBySymbol = new Map<string, Trade>()
  const rounds: { pnl: number; days: number }[] = []

  // 按时间排序(BUY 和 SELL 按 date)
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    if (t.side === 'BUY') {
      if (!openBySymbol.has(t.symbolCode)) openBySymbol.set(t.symbolCode, t)
    } else {
      const open = openBySymbol.get(t.symbolCode)
      if (open) {
        const pnl = (t.price - open.price) * open.shares
        const days = Math.round(
          (Date.parse(t.date) - Date.parse(open.date)) / (1000 * 60 * 60 * 24),
        )
        rounds.push({ pnl, days: Math.max(days, 0) })
        openBySymbol.delete(t.symbolCode)
      }
    }
  }

  if (rounds.length === 0) {
    return { winRate: 0, avgHoldingDays: 0 }
  }

  const wins = rounds.filter((r) => r.pnl > 0).length
  const winRate = wins / rounds.length
  const avgHoldingDays = rounds.reduce((s, r) => s + r.days, 0) / rounds.length
  return { winRate, avgHoldingDays }
}