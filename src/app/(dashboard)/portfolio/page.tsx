import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPortfolios, listPositions } from '@/lib/trading/query'
import { getProvider } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortfolioSummary } from '@/components/portfolio/portfolio-summary'
import { PositionsTable } from '@/components/portfolio/positions-table'
import { RiskSummary } from '@/components/portfolio/risk-summary'
import { EquityCurveChart } from '@/components/backtest/equity-curve-chart'
import { LanguageProvider } from '@/components/providers/language-provider'
import { getLanguage } from '@/lib/i18n'
import {
  computeEquityFromPortfolio,
  computePeakEquity,
  listSnapshotsByPortfolio,
} from '@/lib/risk'
import { getStrategy } from '@/lib/strategy/query'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const lang = await getLanguage()
  const portfolios = await listPortfolios()
  const portfolio = portfolios[0] // 简化:展示第一个

  if (!portfolio) {
    return (
      <LanguageProvider initialLang={lang}>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">当前持仓</h1>
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <p>尚未启动任何策略</p>
              <p className="mt-2 text-sm">
                从策略详情页点击 &ldquo;启动&rdquo; 按钮即可
              </p>
            </CardContent>
          </Card>
        </div>
      </LanguageProvider>
    )
  }

  // 加载持仓 + 行情快照
  const positions = await listPositions(portfolio.id)
  const provider = getProvider()
  const today = new Date().toISOString().slice(0, 10)
  const positionsWithMarket = await Promise.all(
    positions.map(async (p) => {
      const bars = await provider.getDailyBars(p.symbolCode, today, today)
      const bar = bars[bars.length - 1]
      const marketPrice = bar?.close ?? p.costPrice
      const marketValue = p.shares * marketPrice
      const pnl = (marketPrice - p.costPrice) * p.shares
      const pnlPct =
        p.costPrice > 0 ? (marketPrice - p.costPrice) / p.costPrice : 0
      return { ...p, marketPrice, marketValue, pnl, pnlPct }
    }),
  )
  const totalMarketValue = positionsWithMarket.reduce((s, p) => s + p.marketValue, 0)
  const totalAssets = portfolio.cash + totalMarketValue
  const totalPnl = positionsWithMarket.reduce((s, p) => s + p.pnl, 0)
  const totalCostBasis = positions.reduce((s, p) => s + p.shares * p.costPrice, 0)
  const totalPnlPct = totalCostBasis > 0 ? totalPnl / totalCostBasis : 0

  // 构造 equity curve(简化为单点;Phase 4 用 snapshot 表)
  const equityCurve = [{ date: today, equity: totalAssets }]

  // 风控数据:peak equity / drawdown / drawdown limit
  const lastCloseBySymbol = new Map<string, number>()
  for (const pm of positionsWithMarket) {
    lastCloseBySymbol.set(pm.symbolCode, pm.marketPrice)
  }
  const equityForRisk = computeEquityFromPortfolio({
    cash: portfolio.cash,
    positions: positions.map((p) => ({
      symbolCode: p.symbolCode,
      shares: p.shares,
    })),
    lastCloseBySymbol,
  })
  const snapshots = await listSnapshotsByPortfolio(portfolio.id)
  const peakEquity = computePeakEquity({
    portfolio,
    currentEquity: equityForRisk,
    snapshots,
  })
  const drawdownPct =
    peakEquity > 0 ? ((equityForRisk - peakEquity) / peakEquity) * 100 : 0
  const strategy = await getStrategy(portfolio.strategyId)
  const drawdownLimit = strategy?.spec.holding.maxDrawdownPct ?? 20

  return (
    <LanguageProvider initialLang={lang}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">当前持仓</h1>
          <Link
            href="/portfolio/trades"
            className="text-sm text-indigo-600 hover:underline"
          >
            查看成交明细 →
          </Link>
        </div>

        <PortfolioSummary
          totalAssets={totalAssets}
          cash={portfolio.cash}
          marketValue={totalMarketValue}
          floatingPnl={totalPnl}
          floatingPnlPct={totalPnlPct}
          status={portfolio.status}
        />

        <RiskSummary
          peakEquity={peakEquity}
          currentEquity={equityForRisk}
          drawdownPct={Math.abs(drawdownPct)}
          drawdownLimit={drawdownLimit}
          status={portfolio.status}
          stopReason={portfolio.stopReason}
        />

        <Card>
          <CardHeader>
            <CardTitle>权益曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <EquityCurveChart data={equityCurve} />
            <p className="mt-2 text-xs text-gray-500">
              当前为单点展示,完整曲线将在 Phase 4 接入
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>持仓明细</CardTitle>
          </CardHeader>
          <CardContent>
            {positionsWithMarket.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">暂无持仓</p>
            ) : (
              <PositionsTable positions={positionsWithMarket} />
            )}
          </CardContent>
        </Card>
      </div>
    </LanguageProvider>
  )
}