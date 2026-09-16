import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBacktestRun } from '@/lib/backtest'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MetricsTable } from '@/components/backtest/metrics-table'
import { TradesTable } from '@/components/backtest/trades-table'
import { EquityCurveChart } from '@/components/backtest/equity-curve-chart'
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BacktestReportPage({ params }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { id } = await params
  const run = await getBacktestRun(id)
  if (!run) notFound()

  const lang = await getLanguage()

  // 取策略名
  const { data: strategy } = await supabase
    .from('trade260915a_strategies')
    .select('name')
    .eq('id', run.strategyId)
    .single()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {strategy?.name ?? 'Backtest'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {lang === 'en' ? 'From' : '回测区间'} {run.startDate} → {run.endDate}
          </p>
        </div>
        <Link
          href={`/strategy/${run.strategyId}` as never}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← {lang === 'en' ? 'Back to Strategy' : '返回策略'}
        </Link>
      </div>

      {run.status === 'running' && (
        <Alert>
          <AlertDescription>
            {lang === 'en' ? 'Backtest is still running...' : '回测运行中...'}
          </AlertDescription>
        </Alert>
      )}

      {run.status === 'failed' && (
        <Alert variant="destructive">
          <AlertDescription>
            {lang === 'en' ? 'Backtest failed: ' : '回测失败: '}
            {run.errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {run.status === 'completed' && run.result && (
        <>
          <MetricsTable
            metrics={run.result.metrics}
            initialCash={run.result.initialCash}
            finalEquity={run.result.finalEquity}
          />

          <Card>
            <CardHeader>
              <CardTitle>
                {lang === 'en' ? 'Equity Curve' : '权益曲线'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EquityCurveChart data={run.result.equityCurve} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {lang === 'en' ? 'Trades' : '交易明细'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {run.result.trades.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {lang === 'en'
                    ? 'This backtest produced no trades.'
                    : '本次回测没有产生交易'}
                </p>
              ) : (
                <TradesTable trades={run.result.trades} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}