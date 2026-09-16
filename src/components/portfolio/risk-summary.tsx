'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'

interface RiskSummaryProps {
  peakEquity: number
  currentEquity: number
  drawdownPct: number
  drawdownLimit: number
  status: 'active' | 'paused' | 'stopped'
  stopReason: string | null
}

export function RiskSummary(props: RiskSummaryProps) {
  const { t } = useLanguage()

  const statusLabel =
    props.status === 'stopped'
      ? (t('quant.portfolio.statusStopped') as string)
      : (t(`quant.portfolio.status.${props.status}`) as string)

  const peakLabel = t('quant.risk.peakEquity', { value: '' }) as string
  const drawdownLabel = t('quant.risk.currentDrawdown') as string
  const limitLabel = t('quant.risk.drawdownLimit') as string

  const items = [
    {
      label: peakLabel.trim() || 'Peak equity',
      value: `¥${props.peakEquity.toFixed(2)}`,
    },
    {
      label: drawdownLabel,
      value: `${props.drawdownPct.toFixed(2)}%`,
      negative: props.drawdownPct >= props.drawdownLimit,
    },
    {
      label: limitLabel,
      value: `${props.drawdownLimit}%`,
    },
    {
      label: 'Status',
      value: statusLabel,
    },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <Card key={it.label}>
            <CardContent className="p-3">
              <div className="text-xs text-gray-500">{it.label}</div>
              <div
                className={
                  'mt-1 text-lg font-semibold ' +
                  ('negative' in it && it.negative
                    ? 'text-red-600'
                    : 'text-gray-900')
                }
              >
                {it.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {props.status === 'stopped' && props.stopReason && (
        <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">
          {t('quant.portfolio.stopReason', { reason: props.stopReason }) as string}
        </div>
      )}
    </div>
  )
}