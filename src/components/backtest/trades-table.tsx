'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLanguage } from '@/components/providers/language-provider'
import type { Trade } from '@/lib/backtest'

interface TradesTableProps {
  trades: Trade[]
  maxHeight?: number
}

export function TradesTable({ trades, maxHeight = 480 }: TradesTableProps) {
  const { t } = useLanguage()

  return (
    <div className="rounded-md border" style={{ maxHeight, overflow: 'auto' }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Fee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((tr, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">{tr.date}</TableCell>
              <TableCell>{tr.symbolCode}</TableCell>
              <TableCell>
                <span
                  className={
                    tr.side === 'BUY'
                      ? 'text-red-600 font-medium'
                      : 'text-green-600 font-medium'
                  }
                >
                  {tr.side}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{tr.price.toFixed(4)}</TableCell>
              <TableCell className="text-right tabular-nums">{tr.shares}</TableCell>
              <TableCell className="text-right tabular-nums">{tr.amount.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums">{tr.fee.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}