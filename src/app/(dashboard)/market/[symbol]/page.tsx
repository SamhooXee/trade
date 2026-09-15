import { notFound } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getDailyBars, getSymbol } from '@/lib/data/query'
import { KlineChart } from '@/components/market/kline-chart'

interface PageProps {
  params: Promise<{ symbol: string }>
}

export default async function SymbolDetailPage({ params }: PageProps) {
  const { symbol: symbolCode } = await params

  const symbol = await getSymbol(symbolCode)
  if (!symbol) notFound()

  // 最近 60 个交易日
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const bars = await getDailyBars(symbolCode, from, to)

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {symbol.name} ({symbol.code})
        </h1>
        <p className="text-sm text-gray-600">{symbol.market} 主板</p>
      </div>

      <Alert variant="destructive" className="mb-4">
        <AlertDescription>
          展示数据为模拟数据,非真实行情。生产环境请配置真实数据源。
        </AlertDescription>
      </Alert>

      {bars.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-600">
          暂无数据,请先运行 ingest-daily cron 导入历史数据。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <KlineChart bars={bars} symbolName={`${symbol.name} (${symbol.code})`} />
        </div>
      )}
    </div>
  )
}