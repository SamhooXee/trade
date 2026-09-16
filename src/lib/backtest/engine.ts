import { evaluateConditions } from '@/lib/strategy'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'
import { matchFill } from './fills'
import { computeMetrics } from './metrics'
import type {
  BacktestInput,
  BacktestOutput,
  EquityPoint,
  FillRequest,
  Position,
  RebalanceIntent,
  Trade,
} from './types'

/**
 * 引擎注入(便于测试):
 *  - loadBars(sym, from, to)  → 用于策略求值的日线(到 T 日为止)
 *  - loadBarsForFill(sym, from, to) → 用于 T+1 撮合的日线(含 prevClose = .close)
 *  - isTradingDay(dateStr)    → 由 lib/scheduler 提供
 *
 * 生产环境下,默认从 lib/data/query 注入。
 */
export interface BacktestEngineDeps {
  loadBars: (symbol: string, from: string, to: string) => Promise<DailyBar[]>
  loadBarsForFill: (symbol: string, from: string, to: string) => Promise<DailyBar[]>
  isTradingDay: (dateStr: string) => boolean
}

export async function runBacktest(
  rawInput: BacktestInput & BacktestEngineDeps,
): Promise<BacktestOutput> {
  const { spec, startDate, endDate, initialCash, symbols } = rawInput
  const loadBars = rawInput.loadBars
  const loadBarsForFill = rawInput.loadBarsForFill
  const isTradingDay = rawInput.isTradingDay

  // 1. 收集所有交易日(从 startDate 到 endDate)
  const tradingDates: string[] = []
  {
    const start = new Date(startDate + 'T00:00:00Z')
    const end = new Date(endDate + 'T00:00:00Z')
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().slice(0, 10)
      if (isTradingDay(ds)) tradingDates.push(ds)
    }
  }

  // 2. 预加载所有需要的 bars(用于求值 + 撮合)
  const fromForEval = addDays(startDate, -90) // 给因子留 lookback 余量
  const evalBarsBySym = new Map<string, DailyBar[]>()
  for (const sym of symbols ?? []) {
    const bars = await loadBars(sym, fromForEval, endDate)
    evalBarsBySym.set(sym, bars)
  }

  const fillBarsByDateSym = new Map<string, Map<string, DailyBar>>()
  for (const sym of symbols ?? []) {
    const fb = await loadBarsForFill(sym, startDate, endDate)
    const m = new Map<string, DailyBar>()
    for (const b of fb) m.set(b.tradeDate, b)
    fillBarsByDateSym.set(sym, m)
  }

  // 3. 主循环
  const positions = new Map<string, Position>()
  let cash = initialCash
  const trades: Trade[] = []
  const equityCurve: EquityPoint[] = []

  for (let i = 0; i < tradingDates.length; i++) {
    const date = tradingDates[i]

    // 3.1 标记到市场:用 date 当日收盘价计权益
    let mtmEquity = cash
    for (const [sym, pos] of positions) {
      const bars = evalBarsBySym.get(sym) ?? []
      const todayBar = bars.find((b) => b.tradeDate === date)
      if (todayBar) mtmEquity += pos.shares * todayBar.close
    }
    equityCurve.push({ date, equity: mtmEquity })

    // 3.2 计算 signals:entry / exit
    const entrySymbols: string[] = []
    const exitSymbols = new Set<string>()
    for (const sym of symbols ?? []) {
      const bars = evalBarsBySym.get(sym) ?? []
      const barsUpToToday = bars.filter((b) => b.tradeDate <= date)
      const hasPos = positions.has(sym)

      const entryHit = evaluateConditions(spec.entry, barsUpToToday)
      const exitHit = evaluateConditions(spec.exit, barsUpToToday)

      if (!hasPos && entryHit) entrySymbols.push(sym)
      if (hasPos && exitHit) exitSymbols.add(sym)
    }

    // 3.3 生成 rebalance plan
    const intents: RebalanceIntent[] = []

    // 3.3.1 SELL 现有持仓
    for (const sym of exitSymbols) {
      const pos = positions.get(sym)!
      const fb = fillBarsByDateSym.get(sym)
      const nextBar = nextFillBar(fb, date, tradingDates, i)
      if (!nextBar) continue
      // 用 last close 作为目标成交金额的近似(撮合用 open)
      const lastClose = lastCloseUpTo(evalBarsBySym.get(sym) ?? [], date)
      intents.push({
        symbolCode: sym,
        side: 'SELL',
        targetAmount: pos.shares * lastClose,
      })
    }

    // 3.3.2 BUY 新持仓(等权分配现金)
    const targetPositionCount = Math.max(1, spec.holding.maxPositions)
    const newEntries = entrySymbols.slice(0, targetPositionCount - positions.size + exitSymbols.size)
    if (newEntries.length > 0) {
      const perPositionAmount = (cash * (spec.holding.positionSizePct / 100)) / newEntries.length
      for (const sym of newEntries) {
        if (positions.has(sym) || exitSymbols.has(sym)) continue
        const lastClose = lastCloseUpTo(evalBarsBySym.get(sym) ?? [], date)
        intents.push({
          symbolCode: sym,
          side: 'BUY',
          targetAmount: perPositionAmount,
        })
      }
    }

    // 3.4 撮合(用 T+1 的 bar)
    if (intents.length > 0 && i + 1 < tradingDates.length) {
      for (const intent of intents) {
        const fb = fillBarsByDateSym.get(intent.symbolCode)
        const nextBar = nextFillBar(fb, date, tradingDates, i)
        if (!nextBar) continue

        const req: FillRequest = {
          intent,
          nextBar,
          availableShares: positions.get(intent.symbolCode)?.shares,
          availableCash: cash,
        }
        const r = matchFill(req)
        if (r.status !== 'filled' || !r.trade) continue
        const tr = r.trade
        trades.push(tr)

        if (tr.side === 'BUY') {
          const totalCost = tr.amount + tr.fee
          cash -= totalCost
          const existing = positions.get(tr.symbolCode)
          if (existing) {
            const totalShares = existing.shares + tr.shares
            const avgPrice = (existing.costPrice * existing.shares + tr.price * tr.shares) / totalShares
            positions.set(tr.symbolCode, {
              symbolCode: tr.symbolCode,
              shares: totalShares,
              costPrice: avgPrice,
              entryDate: existing.entryDate,
            })
          } else {
            positions.set(tr.symbolCode, {
              symbolCode: tr.symbolCode,
              shares: tr.shares,
              costPrice: tr.price,
              entryDate: tr.date,
            })
          }
        } else {
          // SELL
          cash += tr.amount - tr.fee
          const existing = positions.get(tr.symbolCode)
          if (existing) {
            const remaining = existing.shares - tr.shares
            if (remaining <= 0) {
              positions.delete(tr.symbolCode)
            } else {
              positions.set(tr.symbolCode, {
                symbolCode: tr.symbolCode,
                shares: remaining,
                costPrice: existing.costPrice,
                entryDate: existing.entryDate,
              })
            }
          }
        }
      }
    }
  }

  // 4. 计算指标
  const metrics = computeMetrics({ initialCash, equityCurve, trades })

  return {
    initialCash,
    finalEquity: equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCash,
    metrics,
    trades,
    equityCurve,
  }
}

/** 取截至 date 的最后一根 bar 的 close(用于估算目标金额) */
function lastCloseUpTo(bars: DailyBar[], date: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= date)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}

/** 取下一个交易日 bar(用于撮合);不存在返回 null */
function nextFillBar(
  fb: Map<string, DailyBar> | undefined,
  _fromDate: string,
  tradingDates: string[],
  currentIdx: number,
): DailyBar | null {
  if (!fb) return null
  for (let j = currentIdx + 1; j < tradingDates.length; j++) {
    const nd = tradingDates[j]
    const bar = fb.get(nd)
    if (bar) return bar
  }
  return null
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}