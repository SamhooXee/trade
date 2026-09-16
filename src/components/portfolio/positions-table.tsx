import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Position } from '@/lib/trading/types'

interface PositionsTableProps {
  positions: Array<
    Position & {
      marketPrice: number
      marketValue: number
      pnl: number
      pnlPct: number
    }
  >
}

export function PositionsTable({ positions }: PositionsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Available</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Mkt Value</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">P&L %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => (
          <TableRow key={p.symbolCode}>
            <TableCell className="font-mono">{p.symbolCode}</TableCell>
            <TableCell className="text-right tabular-nums">{p.shares}</TableCell>
            <TableCell className="text-right tabular-nums">{p.availableShares}</TableCell>
            <TableCell className="text-right tabular-nums">{p.costPrice.toFixed(4)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.marketPrice.toFixed(4)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.marketValue.toFixed(2)}</TableCell>
            <TableCell
              className={
                'text-right tabular-nums ' + (p.pnl < 0 ? 'text-red-600' : 'text-green-600')
              }
            >
              {p.pnl >= 0 ? '+' : ''}
              {p.pnl.toFixed(2)}
            </TableCell>
            <TableCell
              className={
                'text-right tabular-nums ' +
                (p.pnlPct < 0 ? 'text-red-600' : 'text-green-600')
              }
            >
              {p.pnlPct >= 0 ? '+' : ''}
              {(pnlPctToPercent(p.pnlPct)).toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function pnlPctToPercent(v: number): number {
  return v * 100
}