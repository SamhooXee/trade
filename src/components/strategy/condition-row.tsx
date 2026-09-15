'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FactorSelector } from './factor-selector'
import { useLanguage } from '@/components/providers/language-provider'
import type { Condition, Comparator, FactorId } from '@/lib/strategy'
import { COMPARATORS } from '@/lib/strategy'

interface ConditionRowProps {
  index: number
  condition: Condition
  onChange: (next: Condition) => void
  onRemove: (index: number) => void
}

export function ConditionRow({ index, condition, onChange, onRemove }: ConditionRowProps) {
  const { t } = useLanguage()

  function handleFactorChange(factorId: FactorId, params: Record<string, number>) {
    onChange({ ...condition, factor: factorId, params })
  }

  function handleComparatorChange(comparator: Comparator) {
    onChange({ ...condition, comparator })
  }

  function handleThresholdChange(value: number) {
    onChange({ ...condition, threshold: value })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          条件 #{index + 1}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRemove(index)}
        >
          {t('quant.strategy.fields.removeCondition')}
        </Button>
      </div>

      <FactorSelector
        factorId={condition.factor as FactorId}
        params={condition.params}
        onChange={handleFactorChange}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`comparator-${index}`}>
            {t('quant.factor.comparator')}
          </Label>
          <select
            id={`comparator-${index}`}
            value={condition.comparator}
            onChange={(e) => handleComparatorChange(e.target.value as Comparator)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {COMPARATORS.map((c) => (
              <option key={c} value={c}>
                {(t(`quant.factor.comparators.${c}`) as string) || c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={`threshold-${index}`}>
            {t('quant.factor.threshold')}
          </Label>
          <Input
            id={`threshold-${index}`}
            type="number"
            step="0.01"
            value={condition.threshold}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) handleThresholdChange(v)
            }}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  )
}