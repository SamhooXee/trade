'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLanguage } from '@/components/providers/language-provider'
import {
  startStrategyAction,
  pauseStrategyAction,
  stopStrategyAction,
} from '@/lib/trading/actions'
import type { Portfolio } from '@/lib/trading/types'

interface StrategyControlsProps {
  strategyId: string
  portfolio: Portfolio | null
}

export function StrategyControls({ strategyId, portfolio }: StrategyControlsProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleStart() {
    if (!confirm(t('quant.trading.startConfirm') as string)) return
    setError(null)
    startTransition(async () => {
      const r = await startStrategyAction(strategyId)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  function handlePause() {
    if (!portfolio) return
    setError(null)
    startTransition(async () => {
      const r = await pauseStrategyAction(portfolio.id)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  function handleStop() {
    if (!portfolio) return
    if (!confirm(t('quant.trading.stopConfirm') as string)) return
    setError(null)
    startTransition(async () => {
      const r = await stopStrategyAction(portfolio.id)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        {!portfolio || portfolio.status === 'stopped' ? (
          <Button onClick={handleStart} disabled={isPending}>
            {t('quant.trading.start') as string}
          </Button>
        ) : null}
        {portfolio?.status === 'active' && (
          <>
            <Button onClick={handlePause} variant="outline" disabled={isPending}>
              {t('quant.trading.pause') as string}
            </Button>
            <Button onClick={handleStop} variant="destructive" disabled={isPending}>
              {t('quant.trading.stop') as string}
            </Button>
          </>
        )}
        {portfolio?.status === 'paused' && (
          <>
            <Button onClick={handleStart} disabled={isPending}>
              {t('quant.trading.resume') as string}
            </Button>
            <Button onClick={handleStop} variant="destructive" disabled={isPending}>
              {t('quant.trading.stop') as string}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}