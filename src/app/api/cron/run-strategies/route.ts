import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import {
  listActivePortfoliosService,
  listPositionsService,
  insertOrderService,
  insertRunLogService,
} from '@/lib/trading/query'
import { getStrategy } from '@/lib/strategy/query'
import { getProvider } from '@/lib/data'
import { generateRebalancePlan } from '@/lib/trading/rebalance'
import type { DailyBar } from '@/lib/data'

export const dynamic = 'force-dynamic'

interface RunSummary {
  portfolioId: string
  signalsCount: number
  ordersCount: number
  notes?: string
}

export async function POST(req: Request) {
  const authErr = checkCronAuth(req)
  if (authErr) return authErr

  const provider = getProvider()
  const allSymbols = await provider.listSymbols()
  const symbolCodes = allSymbols.map((s) => s.code)

  // 今日日期(UTC) — cron 触发时假定为北京 15:10 = UTC 07:10
  const today = new Date().toISOString().slice(0, 10)

  const portfolios = await listActivePortfoliosService()
  const summary: RunSummary[] = []

  for (const portfolio of portfolios) {
    // 1. strategy_run_log 幂等检查
    const runLog = await insertRunLogService({
      userId: portfolio.userId,
      portfolioId: portfolio.id,
      tradeDate: today,
      signalsCount: 0,
      ordersCount: 0,
      notes: 'start',
    })
    if (!runLog) {
      summary.push({
        portfolioId: portfolio.id,
        signalsCount: 0,
        ordersCount: 0,
        notes: 'already_run_today',
      })
      continue
    }

    // 2. 取 strategy spec
    const strategy = await getStrategy(portfolio.strategyId)
    if (!strategy) {
      summary.push({
        portfolioId: portfolio.id,
        signalsCount: 0,
        ordersCount: 0,
        notes: 'strategy_not_found',
      })
      continue
    }

    // 3. 加载 bars(每个 symbol)
    const barsBySymbol = new Map<string, DailyBar[]>()
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    for (const sym of symbolCodes) {
      const bars = await provider.getDailyBars(sym, fromDate, today)
      barsBySymbol.set(sym, bars)
    }

    // 4. 加载当前持仓
    const positions = await listPositionsService(portfolio.id)

    // 5. 生成 plan
    const plan = generateRebalancePlan({
      portfolio,
      positions,
      spec: strategy.spec,
      symbols: symbolCodes,
      barsBySymbol,
      today,
    })

    // 6. 提交 orders(幂等:相同 portfolio + symbol + side + trade_date)
    let ordersCount = 0
    for (const intent of plan.intents) {
      const last = lastCloseForSymbol(
        barsBySymbol.get(intent.symbolCode) ?? [],
        today,
      )
      if (last <= 0) continue
      const shares = Math.floor(intent.targetAmount / last)
      if (shares < 100) continue
      const inserted = await insertOrderService({
        userId: portfolio.userId,
        portfolioId: portfolio.id,
        symbolCode: intent.symbolCode,
        side: intent.side,
        shares,
        intendedPrice: last,
        tradeDate: today,
      })
      if (inserted) ordersCount += 1
    }

    summary.push({
      portfolioId: portfolio.id,
      signalsCount: plan.intents.length,
      ordersCount,
    })
  }

  return NextResponse.json({
    date: today,
    portfoliosProcessed: portfolios.length,
    results: summary,
  })
}

function lastCloseForSymbol(bars: DailyBar[], today: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= today)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}