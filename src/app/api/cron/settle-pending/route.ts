import { NextResponse } from 'next/server'
import { withCronGuard } from '@/lib/scheduler/cron-runner'
import {
  computeEquityFromPortfolio,
  upsertEquitySnapshotService,
} from '@/lib/risk'
import {
  listPendingOrdersService,
  getPortfolioService,
  listPositionsService,
  upsertPositionService,
  insertFillService,
  updateOrderService,
  savePortfolioCashService,
  listActivePortfoliosService,
} from '@/lib/trading/query'
import { getProvider } from '@/lib/data'
import { matchFill } from '@/lib/backtest'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return withCronGuard(
    req,
    async () => {
      const provider = getProvider()
      const today = new Date().toISOString().slice(0, 10)

      // 1. 拉所有 pending orders(今日及之前 — T-1 15:10 生成的,今早撮合)
      const pendingOrders = await listPendingOrdersService(today)
      if (pendingOrders.length === 0) {
        // 即便无订单,也写一下 snapshot(让 peak 有记录)
        await writeSnapshotsForActivePortfolios(provider, today)
        return NextResponse.json({ date: today, filled: 0, rejected: 0 })
      }

      // 2. 按 portfolio 分组
      const byPortfolio = new Map<string, typeof pendingOrders>()
      for (const o of pendingOrders) {
        const list = byPortfolio.get(o.portfolioId) ?? []
        list.push(o)
        byPortfolio.set(o.portfolioId, list)
      }

      let totalFilled = 0
      let totalRejected = 0

      for (const [portfolioId, orders] of byPortfolio) {
        const portfolio = await getPortfolioService(portfolioId)
        if (!portfolio) continue

        // 3. 加载今日 bar
        const bars = new Map<
          string,
          { tradeDate: string; open: number; close: number }
        >()
        for (const o of orders) {
          const dailyBars = await provider.getDailyBars(
            o.symbolCode,
            today,
            today,
          )
          const b = dailyBars[dailyBars.length - 1]
          if (b)
            bars.set(o.symbolCode, {
              tradeDate: b.tradeDate,
              open: b.open,
              close: b.close,
            })
        }

        // 4. 加载当前持仓
        const positions = await listPositionsService(portfolioId)
        const positionsMap = new Map(positions.map((p) => [p.symbolCode, p]))

        let cash = portfolio.cash

        for (const order of orders) {
          const bar = bars.get(order.symbolCode)
          if (!bar) {
            await updateOrderService(order.id, {
              status: 'rejected',
              reject_reason: 'no_bar',
            })
            totalRejected += 1
            continue
          }

          // 涨跌停 + 整手 + 现金/股数校验
          const pos = positionsMap.get(order.symbolCode)
          const r = matchFill({
            intent: {
              symbolCode: order.symbolCode,
              side: order.side,
              targetAmount: order.shares * bar.open,
            },
            nextBar: {
              symbolCode: order.symbolCode,
              tradeDate: bar.tradeDate,
              open: bar.open,
              high: bar.open,
              low: bar.open,
              close: bar.close, // prevClose
              volume: 0,
              amount: 0,
            },
            availableShares: pos?.availableShares ?? 0,
            availableCash: cash,
          })

          if (r.status !== 'filled' || !r.trade) {
            await updateOrderService(order.id, {
              status: 'rejected',
              reject_reason: r.reason ?? 'unknown',
            })
            totalRejected += 1
            continue
          }

          const tr = r.trade
          await insertFillService({
            userId: order.userId,
            portfolioId: order.portfolioId,
            orderId: order.id,
            symbolCode: order.symbolCode,
            side: order.side,
            price: tr.price,
            shares: tr.shares,
            amount: tr.amount,
            fee: tr.fee,
          })
          await updateOrderService(order.id, {
            status: 'filled',
            filled_at: new Date().toISOString(),
            filled_price: String(tr.price),
            filled_shares: tr.shares,
            fee: String(tr.fee),
          })

          // 更新 cash
          if (order.side === 'BUY') cash -= tr.amount + tr.fee
          else cash += tr.amount - tr.fee

          // 更新 position
          let nextShares: number
          let nextAvailable: number
          let nextCost: number
          if (order.side === 'BUY') {
            if (pos) {
              const total = pos.shares + tr.shares
              nextCost =
                (pos.costPrice * pos.shares + tr.price * tr.shares) / total
              nextShares = total
              nextAvailable = pos.availableShares
            } else {
              nextCost = tr.price
              nextShares = tr.shares
              nextAvailable = 0
            }
          } else {
            if (!pos) {
              totalRejected += 1
              continue
            }
            nextShares = pos.shares - tr.shares
            nextCost = pos.costPrice
            nextAvailable = pos.availableShares - tr.shares
          }
          const updated = await upsertPositionService({
            userId: order.userId,
            portfolioId: order.portfolioId,
            symbolCode: order.symbolCode,
            shares: nextShares,
            availableShares: nextAvailable,
            costPrice: nextCost,
          })
          positionsMap.set(order.symbolCode, updated)
          totalFilled += 1
        }

        await savePortfolioCashService(portfolioId, cash)
      }

      // 5. 撮合后写 equity snapshot(幂等,所有 active portfolios 都写)
      await writeSnapshotsForActivePortfolios(provider, today)

      return NextResponse.json({
        date: today,
        filled: totalFilled,
        rejected: totalRejected,
      })
    },
    { name: 'settle-pending' },
  )
}

/** 给所有 active portfolios 写今日 equity snapshot(幂等:upsert by (portfolio, trade_date)) */
async function writeSnapshotsForActivePortfolios(
  provider: Awaited<ReturnType<typeof getProvider>>,
  tradeDate: string,
): Promise<void> {
  const activePortfolios = await listActivePortfoliosService()
  for (const portfolio of activePortfolios) {
    const positions = await listPositionsService(portfolio.id)
    const symbols = Array.from(new Set(positions.map((p) => p.symbolCode)))
    const lastCloseBySymbol = new Map<string, number>()
    for (const sym of symbols) {
      const dailyBars = await provider.getDailyBars(sym, tradeDate, tradeDate)
      const b = dailyBars[dailyBars.length - 1]
      if (b) lastCloseBySymbol.set(sym, b.close)
    }
    const equity = computeEquityFromPortfolio({
      cash: portfolio.cash,
      positions: positions.map((p) => ({
        symbolCode: p.symbolCode,
        shares: p.shares,
      })),
      lastCloseBySymbol,
    })
    const marketValue = equity - portfolio.cash
    await upsertEquitySnapshotService({
      userId: portfolio.userId,
      portfolioId: portfolio.id,
      tradeDate,
      equity,
      cash: portfolio.cash,
      marketValue: marketValue > 0 ? marketValue : 0,
    })
  }
}