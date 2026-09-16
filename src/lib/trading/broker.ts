import type { Order, OrderRequest, SettleResult } from './types'

/** BrokerAdapter 接口 —— 抽象所有券商交互 */
export interface BrokerAdapter {
  /** 提交订单,返回完整 Order 记录 */
  submitOrder(req: OrderRequest): Promise<Order>

  /** 取消 pending 订单(只允许 pending → cancelled) */
  cancelOrder(orderId: string): Promise<Order>

  /** 撮合 pending 订单(对一批订单,在 T+1 用开盘价撮合) */
  settlePendingOrders(orders: Order[], ctx: {
    bars: Map<string, { tradeDate: string; open: number; close: number }>
  }): Promise<SettleResult[]>

  /** 查询单个订单 */
  getOrder(orderId: string): Promise<Order | null>

  /** 列出指定组合的所有 pending 订单 */
  listPendingOrders(portfolioId: string): Promise<Order[]>
}