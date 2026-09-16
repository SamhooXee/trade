'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'

interface DecisionEntry {
  ruleId: string
  action: 'allow' | 'modify' | 'reject' | 'stop'
  reasonCode: string | null
}

interface RiskDecisionLogProps {
  notes: string | null // run_log.notes(逗号分隔 "RULE:ACTION")
}

/** 解析 run_log.notes 字符串为 DecisionEntry[] */
function parseNotes(notes: string | null): DecisionEntry[] {
  if (!notes) return []
  return notes
    .split(',')
    .filter(Boolean)
    .map((seg) => {
      const [ruleId, action] = seg.split(':')
      const validActions: DecisionEntry['action'][] = [
        'allow',
        'modify',
        'reject',
        'stop',
      ]
      const act = (action ?? 'allow') as DecisionEntry['action']
      return {
        ruleId,
        action: validActions.includes(act) ? act : 'allow',
        reasonCode: null,
      }
    })
}

const ACTION_STYLES: Record<DecisionEntry['action'], string> = {
  allow: 'bg-green-100 text-green-700',
  modify: 'bg-yellow-100 text-yellow-700',
  reject: 'bg-orange-100 text-orange-700',
  stop: 'bg-red-100 text-red-700',
}

export function RiskDecisionLog({ notes }: RiskDecisionLogProps) {
  const { t } = useLanguage()
  const entries = parseNotes(notes)
  if (entries.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('quant.risk.decisionLog') as string}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="text-gray-700">
                {(t(`quant.risk.rule.${e.ruleId}`) as string) || e.ruleId}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[e.action]}`}
              >
                {(t(`quant.risk.action.${e.action}`) as string) || e.action}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}