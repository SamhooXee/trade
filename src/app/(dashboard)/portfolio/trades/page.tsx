import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listFills } from '@/lib/trading/query'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function TradesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const fills = await listFills(200)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成交明细</h1>
        <Link
          href="/portfolio"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← 返回持仓
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {fills.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">暂无成交</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成交日期</TableHead>
                  <TableHead>股票</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead className="text-right">成交价</TableHead>
                  <TableHead className="text-right">股数</TableHead>
                  <TableHead className="text-right">成交金额</TableHead>
                  <TableHead className="text-right">费用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fills.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">
                      {f.filledAt.slice(0, 16).replace('T', ' ')}
                    </TableCell>
                    <TableCell className="font-mono">{f.symbolCode}</TableCell>
                    <TableCell>
                      <span className={f.side === 'BUY' ? 'text-red-600' : 'text-green-600'}>
                        {f.side}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.price.toFixed(4)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.shares}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.fee.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}