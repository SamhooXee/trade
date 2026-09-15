'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getFactor, type FactorId, FACTOR_IDS } from '@/lib/factors'
import { useLanguage } from '@/components/providers/language-provider'

interface FactorSelectorProps {
  factorId: FactorId
  params: Record<string, number>
  onChange: (factorId: FactorId, params: Record<string, number>) => void
}

export function FactorSelector({ factorId, params, onChange }: FactorSelectorProps) {
  const { t, lang } = useLanguage()

  const factor = getFactor(factorId)
  const factorLabel =
    (t(`quant.factor.${factor.id}`) as string) || (lang === 'en' ? factor.labelEn : factor.label)

  function handleFactorChange(newId: string) {
    const newFactor = getFactor(newId as FactorId)
    const newParams: Record<string, number> = {}
    for (const p of newFactor.params) {
      newParams[p.key] = p.default
    }
    onChange(newId as FactorId, newParams)
  }

  function handleParamChange(key: string, value: number) {
    onChange(factorId, { ...params, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="factor-select">{t('quant.factor.factor')}</Label>
        <select
          id="factor-select"
          value={factorId}
          onChange={(e) => handleFactorChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {FACTOR_IDS.map((id) => (
            <option key={id} value={id}>
              {(t(`quant.factor.${id}`) as string) || id}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {lang === 'en' ? factor.descriptionEn : factor.description}
        </p>
        <p className="mt-1 text-xs text-gray-400">{factorLabel}</p>
      </div>

      {factor.params.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {factor.params.map((p) => (
            <div key={p.key}>
              <Label htmlFor={`param-${p.key}`}>
                {(t(`quant.factor.params.${p.key}`) as string) || (lang === 'en' ? p.labelEn : p.label)}
              </Label>
              <Input
                id={`param-${p.key}`}
                type="number"
                min={p.min}
                max={p.max}
                value={params[p.key] ?? p.default}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) handleParamChange(p.key, v)
                }}
                className="mt-1"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}