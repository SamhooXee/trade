/** 订单状态机 */
export type OrderStatus = 'pending' | 'filled' | 'rejected' | 'cancelled'
export type OrderSide = 'BUY' | 'SELL'

/** 订单请求(给 BrokerAdapter.submitOrder) */
export interface OrderRequest {
  portfolioId: string
  symbolCode: string
  side: OrderSide
  shares: number
  intendedPrice: number
  /** 提交交易日 (cron run-strategies 当日) */
  tradeDate: string
}

/** 订单(数据库 + BrokerAdapter 通用) */
export interface Order {
  id: string
  userId: string
  portfolioId: string
  symbolCode: string
  side: OrderSide
  shares: number
  intendedPrice: number
  tradeDate: string
  status: OrderStatus
  rejectReason: string | null
  submittedAt: string
  filledAt: string | null
  filledPrice: number | null
  filledShares: number | null
  fee: number | null
}

/** 持仓 */
export interface Position {
  id: string
  userId: string
  portfolioId: string
  symbolCode: string
  shares: number // 总持仓(含 T+1 锁定)
  availableShares: number // 可卖(T+1 解禁后)
  costPrice: number // 平均成本
  updatedAt: string
}

/** 成交明细 */
export interface Fill {
  id: string
  userId: string
  portfolioId: string
  orderId: string
  symbolCode: string
  side: OrderSide
  price: number
  shares: number
  amount: number
  fee: number
  filledAt: string
}

/** 组合(portfolio) */
export interface Portfolio {
  id: string
  userId: string
  strategyId: string
  cash: number
  initialCash: number
  status: 'active' | 'paused' | 'stopped'
  stopReason: string | null
  startedAt: string
  stoppedAt: string | null
}

/** 策略运行日志条目 */
export interface StrategyRunLogEntry {
  id: string
  userId: string
  portfolioId: string
  tradeDate: string
  runAt: string
  signalsCount: number
  ordersCount: number
  notes: string | null
}

/** BrokerAdapter 撮合结果(给 PaperBroker.settlePendingOrders 单笔结果) */
export interface SettleResult {
  orderId: string
  status: 'filled' | 'rejected'
  rejectReason?: string
  fill?: Fill
  /** 撮合后的持仓快照(便于测试断言) */
  positionAfter?: {
    symbolCode: string
    shares: number
    availableShares: number
    costPrice: number
  }
  /** 撮合后的现金 */
  cashAfter?: number
}

/** 撮合上下文(给 BrokerAdapter.settlePendingOrders 共享状态) */
export interface SettleContext {
  /** T+1 开盘 bar,symbol → { tradeDate, open, prevClose } */
  bars: Map<string, { tradeDate: string; open: number; close: number }>
}