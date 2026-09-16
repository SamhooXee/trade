'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'
import type { Metrics } from '@/lib/backtest'

interface MetricsTableProps {
  metrics: Metrics
  initialCash: number
  finalEquity: number
}

interface MetricItem {
  labelKey: string
  value: string
  /** 是否为负数(用于上色) */
  negative?: boolean
}

function formatPct(v: number, withSign = true): string {
  const pct = v * 100
  const sign = withSign && pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function MetricsTable({ metrics, initialCash, finalEquity }: MetricsTableProps) {
  const { t } = useLanguage()

  const items: MetricItem[] = [
    { labelKey: 'quant.metrics.totalReturn', value: formatPct(metrics.totalReturn), negative: metrics.totalReturn < 0 },
    { labelKey: 'quant.metrics.annualizedReturn', value: formatPct(metrics.annualizedReturn), negative: metrics.annualizedReturn < 0 },
    { labelKey: 'quant.metrics.maxDrawdown', value: formatPct(metrics.maxDrawdown), negative: metrics.maxDrawdown < 0 },
    { labelKey: 'quant.metrics.sharpeRatio', value: metrics.sharpeRatio.toFixed(2) },
    { labelKey: 'quant.metrics.winRate', value: formatPct(metrics.winRate, false) },
    { labelKey: 'quant.metrics.totalTrades', value: String(metrics.totalTrades) },
    { labelKey: 'quant.metrics.avgHoldingDays', value: `${metrics.avgHoldingDays.toFixed(1)} d` },
    { labelKey: 'quant.metrics.finalEquity', value: `¥${finalEquity.toFixed(2)}` },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      {items.map((it) => (
        <Card key={it.labelKey}>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500">{t(it.labelKey) as string}</div>
            <div
              className={
                'mt-1 text-2xl font-semibold ' +
                (it.negative ? 'text-red-600' : 'text-gray-900')
              }
            >
              {it.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}