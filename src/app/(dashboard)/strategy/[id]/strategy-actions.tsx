'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { setStrategyStatusAction } from '@/lib/strategy/actions'
import type { StrategyStatus } from '@/lib/strategy'
import { useLanguage } from '@/components/providers/language-provider'

interface StrategyActionsProps {
  strategyId: string
  status: StrategyStatus
}

export function StrategyActions({ strategyId, status }: StrategyActionsProps) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  function setStatus(next: StrategyStatus) {
    startTransition(async () => {
      await setStrategyStatusAction(strategyId, next)
    })
  }

  if (status === 'archived') return null

  return (
    <div className="flex gap-2">
      {status === 'draft' && (
        <Button
          onClick={() => setStatus('active')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.start')}
        </Button>
      )}
      {status === 'active' && (
        <Button
          variant="outline"
          onClick={() => setStatus('paused')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.pause')}
        </Button>
      )}
      {status === 'paused' && (
        <Button
          onClick={() => setStatus('active')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.resume')}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => setStatus('archived')}
        disabled={isPending}
      >
        {t('quant.strategy.actions.archive')}
      </Button>
    </div>
  )
}