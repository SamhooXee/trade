import type { DailyBar } from '@/lib/data'
import type { FillRequest, FillResult, FeeConfig } from './types'

/** 主板涨跌停 ±10% */
export const LIMIT_PCT = 0.10

/** 默认费率(A 股简化版) */
export const DEFAULT_FEE_CONFIG: Required<FeeConfig> = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampTaxRate: 0.001,
}

/** A 股整手 = 100 股 */
export const LOT_SIZE = 100

/**
 * 计算单边费用:
 *  - 佣金: max(commissionMin, amount × commissionRate)
 *  - 印花税(SELL only): amount × stampTaxRate
 */
export function computeFee(
  amount: number,
  side: 'BUY' | 'SELL',
  cfg: FeeConfig = {},
): number {
  const c = { ...DEFAULT_FEE_CONFIG, ...cfg }
  const commission = Math.max(c.commissionMin, amount * c.commissionRate)
  const stamp = side === 'SELL' ? amount * c.stampTaxRate : 0
  return commission + stamp
}

/**
 * 单笔撮合。下单日 T,下一交易日 T+1 open 撮合。
 * 规则:
 *  - BUY: open ≥ prevClose × (1 + LIMIT_PCT) 拒单(涨停无法买入)
 *  - SELL: open ≤ prevClose × (1 - LIMIT_PCT) 拒单(跌停无法卖出)
 *  - 股数向下取整到 LOT_SIZE(整手)
 *  - 计算费用,扣减后入 Trade
 *
 * prevClose = nextBar 的"前一日收盘"。回测引擎把 prevClose 放在 nextBar.close 中
 * (约定:nextBar.close = 撮合参考的前一日收盘价)。
 */
export function matchFill(req: FillRequest): FillResult {
  const { intent, nextBar } = req
  const prevClose = nextBar.close // 回测引擎约定:此处 close = prevClose
  const open = nextBar.open
  const cfg = DEFAULT_FEE_CONFIG

  if (intent.side === 'BUY') {
    if (open >= prevClose * (1 + LIMIT_PCT)) {
      return { status: 'rejected', reason: `BUY rejected: limit-up at ${open}` }
    }
    const targetShares = Math.floor(intent.targetAmount / open)
    const shares = Math.floor(targetShares / LOT_SIZE) * LOT_SIZE
    if (shares <= 0) {
      return { status: 'rejected', reason: `BUY rejected: shares below 1 lot (target=${intent.targetAmount})` }
    }
    if (req.availableCash !== undefined && shares * open > req.availableCash + 1e-6) {
      return { status: 'rejected', reason: 'BUY rejected: insufficient cash' }
    }
    const amount = shares * open
    const fee = computeFee(amount, 'BUY', cfg)
    return {
      status: 'filled',
      trade: {
        date: nextBar.tradeDate,
        symbolCode: intent.symbolCode,
        side: 'BUY',
        price: open,
        shares,
        amount,
        fee,
      },
    }
  }

  // SELL
  if (open <= prevClose * (1 - LIMIT_PCT)) {
    return { status: 'rejected', reason: `SELL rejected: limit-down at ${open}` }
  }
  if (req.availableShares !== undefined && req.availableShares < LOT_SIZE) {
    return { status: 'rejected', reason: 'SELL rejected: availableShares < 100' }
  }
  const targetShares = Math.floor(intent.targetAmount / open)
  let shares = Math.floor(targetShares / LOT_SIZE) * LOT_SIZE
  if (req.availableShares !== undefined && shares > req.availableShares) {
    // 不超过可用
    const adj = Math.floor(req.availableShares / LOT_SIZE) * LOT_SIZE
    if (adj <= 0) {
      return { status: 'rejected', reason: 'SELL rejected: insufficient sellable shares' }
    }
    shares = adj
  }
  if (shares <= 0) {
    return { status: 'rejected', reason: 'SELL rejected: shares round to 0' }
  }
  const amount = shares * open
  const fee = computeFee(amount, 'SELL', cfg)
  return {
    status: 'filled',
    trade: {
      date: nextBar.tradeDate,
      symbolCode: intent.symbolCode,
      side: 'SELL',
      price: open,
      shares,
      amount,
      fee,
    },
  }
}