'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLanguage } from '@/components/providers/language-provider'
import { createBacktestRunAction } from '@/lib/backtest/actions'

interface RunBacktestFormProps {
  strategyId: string
}

export function RunBacktestForm({ strategyId }: RunBacktestFormProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createBacktestRunAction(strategyId, null, fd)
      if (result?.error) setServerError(t(result.error) || result.error)
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="default">
        {t('quant.backtest.newButton') as string}
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('quant.backtest.form.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="startDate">{t('quant.backtest.form.startDate')}</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={yearAgo}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endDate">{t('quant.backtest.form.endDate')}</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={today}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="initialCash">{t('quant.backtest.form.initialCash')}</Label>
              <Input
                id="initialCash"
                name="initialCash"
                type="number"
                min={1}
                step={10000}
                defaultValue={1_000_000}
                required
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? (t('quant.backtest.form.submitting') as string)
                : (t('quant.backtest.form.submit') as string)}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('quant.backtest.form.cancel') as string}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}