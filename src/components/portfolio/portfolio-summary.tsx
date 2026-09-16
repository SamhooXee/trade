'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'

interface PortfolioSummaryProps {
  totalAssets: number
  cash: number
  marketValue: number
  floatingPnl: number
  floatingPnlPct: number
  status: 'active' | 'paused' | 'stopped'
}

export function PortfolioSummary({
  totalAssets,
  cash,
  marketValue,
  floatingPnl,
  floatingPnlPct,
  status,
}: PortfolioSummaryProps) {
  const { t } = useLanguage()
  const items = [
    {
      label: t('quant.portfolio.summary.totalAssets') as string,
      value: `¥${totalAssets.toFixed(2)}`,
    },
    {
      label: t('quant.portfolio.summary.cash') as string,
      value: `¥${cash.toFixed(2)}`,
    },
    {
      label: t('quant.portfolio.summary.marketValue') as string,
      value: `¥${marketValue.toFixed(2)}`,
    },
    {
      label: t('quant.portfolio.summary.floatingPnl') as string,
      value: `${floatingPnl >= 0 ? '+' : ''}¥${floatingPnl.toFixed(2)}`,
      negative: floatingPnl < 0,
    },
    {
      label: t('quant.portfolio.summary.floatingPnlPct') as string,
      value: `${floatingPnlPct >= 0 ? '+' : ''}${(floatingPnlPct * 100).toFixed(2)}%`,
      negative: floatingPnlPct < 0,
    },
    {
      label: t('quant.portfolio.summary.status') as string,
      value: t(`quant.portfolio.status.${status}`) as string,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500">{it.label}</div>
            <div
              className={
                'mt-1 text-xl font-semibold ' +
                ('negative' in it && it.negative ? 'text-red-600' : 'text-gray-900')
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