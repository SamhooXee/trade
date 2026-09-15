import { StrategyForm } from '@/components/strategy/strategy-form'
import { getTranslations } from '@/lib/i18n'

export default async function NewStrategyPage() {
  const { t } = await getTranslations()

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {t('quant.strategy.newButton')}
      </h1>
      <StrategyForm />
    </div>
  )
}