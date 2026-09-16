import { notFound } from 'next/navigation'
import { getStrategy } from '@/lib/strategy/query'
import { StrategyForm } from '@/components/strategy/strategy-form'
import { StrategyControls } from '@/components/strategy/strategy-controls'
import { StrategyActions } from './strategy-actions'
import { RunBacktestForm } from '@/components/backtest/run-backtest-form'
import { getPortfolioByStrategy } from '@/lib/trading/query'
import { getTranslations } from '@/lib/i18n'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StrategyDetailPage({ params }: PageProps) {
  const { id } = await params
  const strategy = await getStrategy(id)
  if (!strategy) notFound()

  const { t } = await getTranslations()
  const portfolio = await getPortfolioByStrategy(strategy.id)

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

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">模拟交易</h2>
        <StrategyControls strategyId={strategy.id} portfolio={portfolio} />
      </section>

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