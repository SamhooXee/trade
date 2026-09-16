'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/components/providers/language-provider'
import type { Period } from '@/lib/data/period'
import { PERIODS } from '@/lib/data/period'

interface PeriodSelectorProps {
  /** 当前激活的 period,通常来自 URL searchParams */
  defaultPeriod: Period
}

/**
 * K 线时间窗选择器。点击 tab 后通过 router.push 更新 URL (?period=...),
 * 触发服务端组件重新查询并 re-render。URL 即状态,可分享。
 */
export function PeriodSelector({ defaultPeriod }: PeriodSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useLanguage()

  const handleChange = (value: string) => {
    router.push(`${pathname}?period=${value}`)
  }

  return (
    <Tabs value={defaultPeriod} onValueChange={handleChange}>
      <TabsList>
        {PERIODS.map((p) => (
          <TabsTrigger key={p} value={p}>
            {t(`market.period.${p}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}