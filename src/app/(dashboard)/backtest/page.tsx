import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listBacktestRuns, type BacktestRunRow } from '@/lib/backtest/query'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function BacktestListPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const lang = await getLanguage()
  const runs = await listBacktestRuns()

  // 取每个 run 对应的策略名(批量查)
  const strategyMap = new Map<string, string>()
  if (runs.length > 0) {
    const ids = [...new Set(runs.map((r) => r.strategyId))]
    const { data } = await supabase
      .from('trade260915a_strategies')
      .select('id, name')
      .in('id', ids)
    for (const row of data ?? []) {
      strategyMap.set(row.id, row.name)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {lang === 'en' ? 'Backtest History' : '历史回测'}
      </h1>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {lang === 'en'
              ? 'No backtest runs yet. Create one from a strategy detail page.'
              : '还没有回测运行,从策略详情页创建一个'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === 'en' ? 'Run At' : '运行时间'}</TableHead>
                  <TableHead>{lang === 'en' ? 'Strategy' : '策略'}</TableHead>
                  <TableHead>{lang === 'en' ? 'Period' : '区间'}</TableHead>
                  <TableHead className="text-right">{lang === 'en' ? 'Total Return' : '总收益'}</TableHead>
                  <TableHead>{lang === 'en' ? 'Status' : '状态'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <BacktestRow key={r.id} run={r} strategyName={strategyMap.get(r.strategyId) ?? '?'} lang={lang} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BacktestRow({
  run,
  strategyName,
  lang,
}: {
  run: BacktestRunRow
  strategyName: string
  lang: 'zh' | 'en'
}) {
  const totalReturn = run.result?.metrics.totalReturn ?? null
  const totalReturnPct =
    totalReturn === null
      ? '—'
      : `${totalReturn > 0 ? '+' : ''}${(totalReturn * 100).toFixed(2)}%`

  const statusText = {
    running: lang === 'en' ? 'Running' : '运行中',
    completed: lang === 'en' ? 'Completed' : '已完成',
    failed: lang === 'en' ? 'Failed' : '失败',
  }[run.status]

  const statusColor = {
    running: 'text-blue-600',
    completed: 'text-green-600',
    failed: 'text-red-600',
  }[run.status]

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {new Date(run.startedAt).toISOString().slice(0, 16).replace('T', ' ')}
      </TableCell>
      <TableCell>{strategyName}</TableCell>
      <TableCell className="text-xs text-gray-600">
        {run.startDate} → {run.endDate}
      </TableCell>
      <TableCell className="text-right tabular-nums">{totalReturnPct}</TableCell>
      <TableCell className={statusColor}>{statusText}</TableCell>
      <TableCell>
        <Link href={`/backtest/${run.id}` as never} className="text-indigo-600 hover:underline text-sm">
          {lang === 'en' ? 'View' : '查看'}
        </Link>
      </TableCell>
    </TableRow>
  )
}