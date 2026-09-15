import Link from 'next/link'
import { listStrategies } from '@/lib/strategy/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from '@/lib/i18n'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-500',
}

export default async function StrategyListPage() {
  const { t } = await getTranslations()
  const strategies = await listStrategies()

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('quant.strategy.listTitle')}
        </h1>
        <Link href="/strategy/new">
          <Button>{t('quant.strategy.newButton')}</Button>
        </Link>
      </div>

      {strategies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-600">
            {t('quant.strategy.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{s.name}</CardTitle>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[s.status]}`}>
                    {t(`quant.strategy.status.${s.status}` as never)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">
                  {s.spec.entry.conditions.length > 0
                    ? `${s.spec.entry.conditions.length} 个入场条件 (${s.spec.entry.combinator})`
                    : (t('quant.strategy.summaryEmpty') as string)}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {t('quant.strategy.updatedAt')}: {new Date(s.updatedAt).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <Link href={`/strategy/${s.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      {t('quant.strategy.actions.edit')}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}