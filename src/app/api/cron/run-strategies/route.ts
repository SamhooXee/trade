import { NextResponse } from 'next/server'
import { withCronGuard } from '@/lib/scheduler/cron-runner'
import {
  evaluateRisk,
  computeEquityFromPortfolio,
  computePeakEquity,
  listSnapshotsByPortfolioService,
} from '@/lib/risk'
import { getStrategy } from '@/lib/strategy/query'
import {
  listActivePortfoliosService,
  listPositionsService,
  insertOrderService,
  insertRunLogService,
  setPortfolioStatusService,
} from '@/lib/trading/query'
import { generateRebalancePlan } from '@/lib/trading'
import { getProvider } from '@/lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RunResult {
  portfolioId: string
  signalsCount: number
  ordersCount: number
  stopped: boolean
  stopReasonCode: string | null
  notes: string | null
}

export async function POST(req: Request) {
  return withCronGuard(
    req,
    async () => {
      const provider = getProvider()
      const allSymbols = await provider.listSymbols()
      const symbolsList = allSymbols.map((s) => s.code)

      // 今日日期(UTC) — cron 触发时假定为北京 15:10 = UTC 07:10
      const today = new Date().toISOString().slice(0, 10)
      // 拉历史窗口(因子计算需要至少 60 根)
      const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)

      const portfolios = await listActivePortfoliosService()
      const results: RunResult[] = []

      for (const portfolio of portfolios) {
        try {
          const strategy = await getStrategy(portfolio.strategyId)
          if (!strategy) {
            results.push({
              portfolioId: portfolio.id,
              signalsCount: 0,
              ordersCount: 0,
              stopped: false,
              stopReasonCode: null,
              notes: 'strategy_missing',
            })
            continue
          }

          // 拉所有 bar(因子计算需要历史)
          const barsBySymbol = new Map<string, Awaited<ReturnType<typeof provider.getDailyBars>>>()
          for (const sym of symbolsList) {
            const bars = await provider.getDailyBars(sym, fromDate, today)
            barsBySymbol.set(sym, bars)
          }

          const positions = await listPositionsService(portfolio.id)

          // 生成 plan
          const plan = generateRebalancePlan({
            portfolio,
            positions,
            spec: strategy.spec,
            symbols: symbolsList,
            barsBySymbol,
            today,
          })

          // 准备风控 context
          const lastCloseBySymbol = new Map<string, number>()
          for (const [sym, bars] of barsBySymbol.entries()) {
            const last = (bars ?? [])
              .filter((b) => b.tradeDate <= today)
              .at(-1)
            if (last) lastCloseBySymbol.set(sym, last.close)
          }

          // 准备风控用的 enriched intents(附 shares + intendedPrice)
          const enrichedIntents = plan.intents.map((i) => {
            const price = lastCloseBySymbol.get(i.symbolCode) ?? 0
            const shares = price > 0 ? Math.floor(i.targetAmount / price) : 0
            return { ...i, intendedPrice: price, shares }
          })

          const equity = computeEquityFromPortfolio({
            cash: portfolio.cash,
            positions: positions.map((p) => ({
              symbolCode: p.symbolCode,
              shares: p.shares,
            })),
            lastCloseBySymbol,
          })
          const snapshots = await listSnapshotsByPortfolioService(portfolio.id)
          const peakEquity = computePeakEquity({
            portfolio,
            currentEquity: equity,
            snapshots,
          })

          const riskResult = evaluateRisk({
            plan: { intents: enrichedIntents },
            ctx: {
              portfolio,
              positions,
              positionsBySymbol: new Map(
                positions.map((p) => [p.symbolCode, p]),
              ),
              cash: portfolio.cash,
              equity,
              peakEquity,
              today,
              appliedModifies: [],
            },
            spec: strategy.spec,
          })

          // stop → 标 portfolio + 跳过订单
          if (riskResult.stopped) {
            await setPortfolioStatusService(
              portfolio.id,
              'stopped',
              riskResult.stopReasonCode,
            )
            await insertRunLogService({
              userId: portfolio.userId,
              portfolioId: portfolio.id,
              tradeDate: today,
              signalsCount: plan.intents.length,
              ordersCount: 0,
              notes: `stopped:${riskResult.stopReasonCode}`,
            })
            results.push({
              portfolioId: portfolio.id,
              signalsCount: plan.intents.length,
              ordersCount: 0,
              stopped: true,
              stopReasonCode: riskResult.stopReasonCode,
              notes: `stopped:${riskResult.stopReasonCode}`,
            })
            continue
          }

          // 用 finalIntents(modify 后)落库订单
          let ordersCount = 0
          for (const intent of riskResult.finalIntents) {
            const shares = intent.shares ?? 0
            const price = intent.intendedPrice ?? 0
            if (shares < 100 || price <= 0) continue
            const o = await insertOrderService({
              userId: portfolio.userId,
              portfolioId: portfolio.id,
              symbolCode: intent.symbolCode,
              side: intent.side,
              shares,
              intendedPrice: price,
              tradeDate: today,
            })
            if (o) ordersCount += 1
          }

          await insertRunLogService({
            userId: portfolio.userId,
            portfolioId: portfolio.id,
            tradeDate: today,
            signalsCount: plan.intents.length,
            ordersCount,
            notes:
              riskResult.log
                .map((l) => `${l.ruleId}:${l.action}`)
                .join(',') || null,
          })
          results.push({
            portfolioId: portfolio.id,
            signalsCount: plan.intents.length,
            ordersCount,
            stopped: false,
            stopReasonCode: null,
            notes: null,
          })
        } catch (err) {
          // 单 portfolio 失败不影响整体
          console.error(
            `[run-strategies] portfolio ${portfolio.id} failed`,
            err,
          )
          results.push({
            portfolioId: portfolio.id,
            signalsCount: 0,
            ordersCount: 0,
            stopped: false,
            stopReasonCode: null,
            notes: 'per_portfolio_error',
          })
        }
      }

      return NextResponse.json({
        date: today,
        portfoliosProcessed: results.length,
        results,
      })
    },
    { name: 'run-strategies' },
  )
}