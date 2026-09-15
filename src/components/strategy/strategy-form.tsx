'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConditionRow } from './condition-row'
import { createStrategyAction, updateStrategyAction } from '@/lib/strategy/actions'
import {
  emptySpec,
  type StrategySpec,
  type Condition,
  type StrategyStatus,
  COMBINATORS,
} from '@/lib/strategy'
import { useLanguage } from '@/components/providers/language-provider'

interface StrategyFormProps {
  initialSpec?: StrategySpec
  initialName?: string
  strategyId?: string
  status?: StrategyStatus
}

export function StrategyForm({
  initialSpec = emptySpec(),
  initialName = '',
  strategyId,
  status,
}: StrategyFormProps) {
  const [spec, setSpec] = useState<StrategySpec>(initialSpec)
  const [submitMode, setSubmitMode] = useState<'draft' | 'enable'>('draft')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<{ name: string }>({
    defaultValues: { name: initialName },
  })

  const { t } = useLanguage()

  function updateEntryCondition(idx: number, c: Condition) {
    setSpec((s) => ({
      ...s,
      entry: { ...s.entry, conditions: s.entry.conditions.map((x, i) => (i === idx ? c : x)) },
    }))
  }

  function removeEntryCondition(idx: number) {
    setSpec((s) => ({
      ...s,
      entry: { ...s.entry, conditions: s.entry.conditions.filter((_, i) => i !== idx) },
    }))
  }

  function addEntryCondition() {
    setSpec((s) => ({
      ...s,
      entry: {
        ...s.entry,
        conditions: [
          ...s.entry.conditions,
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 0 },
        ],
      },
    }))
  }

  function updateExitCondition(idx: number, c: Condition) {
    setSpec((s) => ({
      ...s,
      exit: { ...s.exit, conditions: s.exit.conditions.map((x, i) => (i === idx ? c : x)) },
    }))
  }

  function removeExitCondition(idx: number) {
    setSpec((s) => ({
      ...s,
      exit: { ...s.exit, conditions: s.exit.conditions.filter((_, i) => i !== idx) },
    }))
  }

  function addExitCondition() {
    setSpec((s) => ({
      ...s,
      exit: {
        ...s.exit,
        conditions: [
          ...s.exit.conditions,
          { factor: 'RETURN_20D', params: {}, comparator: '<', threshold: 0 },
        ],
      },
    }))
  }

  const onSubmit = handleSubmit(() => {
    setServerError(null)
    const name = getValues('name')
    startTransition(async () => {
      const action = strategyId ? updateStrategyAction.bind(null, strategyId) : createStrategyAction
      const fd = new FormData()
      fd.append('name', name)
      fd.append('spec', JSON.stringify(spec))
      fd.append('mode', submitMode)
      const result = await action(null, fd)
      if (result?.error) setServerError(result.error)
      if (result?.fieldErrors) {
        const first = Object.values(result.fieldErrors)[0]?.[0]
        if (first) setServerError(first)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{t(serverError) || serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.name')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="strategy-name">{t('quant.strategy.fields.name')}</Label>
          <Input
            id="strategy-name"
            {...register('name', {
              required: true,
              maxLength: 100,
            })}
            placeholder={t('quant.strategy.fields.namePlaceholder') as string}
            className="mt-1"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">
              {t('quant.errors.name_required')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.entryTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quant.strategy.fields.combinator')}</Label>
            <div className="mt-2 flex gap-3">
              {COMBINATORS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entry-combinator"
                    value={c}
                    checked={spec.entry.combinator === c}
                    onChange={() =>
                      setSpec((s) => ({ ...s, entry: { ...s.entry, combinator: c } }))
                    }
                  />
                  {c === 'AND' ? t('quant.strategy.fields.and') : t('quant.strategy.fields.or')}
                </label>
              ))}
            </div>
          </div>

          {spec.entry.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              index={i}
              condition={c}
              onChange={(next) => updateEntryCondition(i, next)}
              onRemove={removeEntryCondition}
            />
          ))}

          <Button type="button" variant="outline" onClick={addEntryCondition}>
            {t('quant.strategy.fields.addCondition')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.exitTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quant.strategy.fields.combinator')}</Label>
            <div className="mt-2 flex gap-3">
              {COMBINATORS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="exit-combinator"
                    value={c}
                    checked={spec.exit.combinator === c}
                    onChange={() =>
                      setSpec((s) => ({ ...s, exit: { ...s.exit, combinator: c } }))
                    }
                  />
                  {c === 'AND' ? t('quant.strategy.fields.and') : t('quant.strategy.fields.or')}
                </label>
              ))}
            </div>
          </div>

          {spec.exit.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              index={i}
              condition={c}
              onChange={(next) => updateExitCondition(i, next)}
              onRemove={removeExitCondition}
            />
          ))}

          <Button type="button" variant="outline" onClick={addExitCondition}>
            {t('quant.strategy.fields.addCondition')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.holdingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="max-positions">{t('quant.strategy.fields.maxPositions')}</Label>
              <Input
                id="max-positions"
                type="number"
                min={1}
                max={50}
                value={spec.holding.maxPositions}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, maxPositions: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="position-pct">{t('quant.strategy.fields.positionSizePct')}</Label>
              <Input
                id="position-pct"
                type="number"
                min={1}
                max={100}
                value={spec.holding.positionSizePct}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, positionSizePct: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="drawdown-pct">{t('quant.strategy.fields.maxDrawdownPct')}</Label>
              <Input
                id="drawdown-pct"
                type="number"
                min={0.1}
                max={100}
                step="0.1"
                value={spec.holding.maxDrawdownPct}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, maxDrawdownPct: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" disabled={isPending}>
          {t('quant.strategy.fields.cancel')}
        </Button>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          onClick={() => setSubmitMode('draft')}
        >
          {t('quant.strategy.fields.saveDraft')}
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          onClick={() => setSubmitMode('enable')}
        >
          {t('quant.strategy.fields.saveAndEnable')}
        </Button>
      </div>

      {status && (
        <p className="text-sm text-gray-500">
          {t(`quant.strategy.status.${status}` as any)}
        </p>
      )}
    </form>
  )
}