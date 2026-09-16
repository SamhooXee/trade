import { evaluateConditions } from '@/lib/strategy'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'
import type { Portfolio, Position, OrderSide } from './types'

export interface RebalanceIntent {
  symbolCode: string
  side: OrderSide
  /** 目标成交金额(BUY:计划买入金额;SELL:按当前持仓市值) */
  targetAmount: number
}

export interface RebalancePlan {
  intents: RebalanceIntent[]
}

interface GenerateInput {
  portfolio: Portfolio
  positions: Position[]
  spec: StrategySpec
  symbols: string[]
  /** symbol → bars 升序,含 today */
  barsBySymbol: Map<string, DailyBar[]>
  today: string // 'YYYY-MM-DD'
}

/**
 * 生成单 portfolio 的重平衡计划。
 * 算法(简化):
 *  1. 计算每个 symbol 的入场信号(根据 spec.entry)
 *  2. 取前 maxPositions 个作为 BUY 候选
 *  3. 当前持仓不在 BUY 候选中 → SELL
 *  4. 等权分配 positionSizePct
 */
export function generateRebalancePlan(input: GenerateInput): RebalancePlan {
  const { portfolio, positions, spec, symbols, barsBySymbol, today } = input

  // 1. 评估入场信号
  const candidates: string[] = []
  for (const sym of symbols) {
    const bars = barsBySymbol.get(sym) ?? []
    const barsUpToToday = bars.filter((b) => b.tradeDate <= today)
    if (evaluateConditions(spec.entry, barsUpToToday)) {
      candidates.push(sym)
    }
  }

  // 2. 取 top maxPositions
  const targetSet = new Set(candidates.slice(0, spec.holding.maxPositions))

  // 3. 计算 SELL(持仓不在 targetSet)
  const intents: RebalanceIntent[] = []
  for (const pos of positions) {
    if (!targetSet.has(pos.symbolCode)) {
      const price = lastClose(barsBySymbol.get(pos.symbolCode) ?? [], today)
      intents.push({
        symbolCode: pos.symbolCode,
        side: 'SELL',
        targetAmount: pos.shares * price,
      })
    }
  }

  // 4. 计算 BUY(等权)
  const newBuys = [...targetSet].filter(
    (s) => !positions.some((p) => p.symbolCode === s),
  )
  if (newBuys.length > 0) {
    const totalBudget = (portfolio.cash * spec.holding.positionSizePct) / 100
    const perPosition = totalBudget / newBuys.length
    for (const sym of newBuys) {
      intents.push({ symbolCode: sym, side: 'BUY', targetAmount: perPosition })
    }
  }

  return { intents }
}

function lastClose(bars: DailyBar[], today: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= today)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}