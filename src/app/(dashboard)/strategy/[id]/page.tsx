import { notFound } from 'next/navigation'
import { getStrategy } from '@/lib/strategy/query'
import { StrategyForm } from '@/components/strategy/strategy-form'
import { StrategyActions } from './strategy-actions'
import { RunBacktestForm } from '@/components/backtest/run-backtest-form'
import { getTranslations } from '@/lib/i18n'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StrategyDetailPage({ params }: PageProps) {
  const { id } = await params
  const strategy = await getStrategy(id)
  if (!strategy) notFound()

  const { t } = await getTranslations()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {strategy.name}
        </h1>
        <p className="text-sm text-gray-500">
          {t('quant.strategy.detailTitle')} · {t(`quant.strategy.status.${strategy.status}` as never)}
        </p>
      </div>

      <StrategyActions
        strategyId={strategy.id}
        status={strategy.status}
      />

      <div className="mt-6">
        <StrategyForm
          strategyId={strategy.id}
          initialName={strategy.name}
          initialSpec={strategy.spec}
          status={strategy.status}
        />
      </div>

      <section className="mt-6">
        <RunBacktestForm strategyId={strategy.id} />
      </section>
    </div>
  )
}