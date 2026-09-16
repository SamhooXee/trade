# 实盘 BrokerAdapter 接入指南

> 本期(MVP)只实现 `PaperBroker`(模拟盘)。本文件说明**未来**如何接入真实券商
> (CTP / XTP / 恒生 UFT / 掘金仿真),为后续 phase 留接缝,本期不做。

## 1. 目标

实现一个新的 `BrokerAdapter`(例如 `CtpBroker`),被 `/api/cron/run-strategies`、
`/api/cron/settle-pending` 通过依赖注入使用,**不**修改任何 cron 端点或 UI 代码。

## 2. 文件结构

每个券商单独一个文件,放在 `src/lib/trading/adapters/<broker>.ts`,
公共接口见 `src/lib/trading/broker.ts`。

```
src/lib/trading/adapters/
├── paper.ts          # 模拟盘(本期唯一实现)
├── ctp.ts            # 综合交易平台(后续 phase)
├── xtp.ts            # 中泰证券 XTP(后续 phase)
├── README.md         # 本文件
```

## 3. 实现清单

每个 `<broker>.ts` 必须实现以下方法(签名见 `broker.ts`):

| 方法 | 必填 | 备注 |
|---|---|---|
| `submitOrder(req)` | ✅ | 同步返回 Order;真实券商常异步推送成交通知,需配合回调 |
| `cancelOrder(orderId)` | ✅ | 仅 `pending → cancelled` |
| `settlePendingOrders(orders, ctx)` | ✅ | 撮合;真实券商由其自身成交回报驱动,本期可用轮询 |
| `getOrder(orderId)` | ✅ | |
| `listPendingOrders(portfolioId)` | ✅ | |
| `accountId()` | 🟡 可选 | 真实券商必须返回账户 id |
| `getSessionToken()` | 🟡 可选 | 真实券商必须返回 token |
| `brokerKind()` | ✅ | 返回 `'ctp'` / `'xtp'` 等稳定字符串 |

## 4. 注入入口

在 `src/lib/trading/factory.ts`(新建文件,后续 phase)统一构造 Broker:

```ts
export function createBroker(): BrokerAdapter {
  if (process.env.BROKER_KIND === 'ctp') {
    return new CtpBroker({ /* ... */ })
  }
  return new PaperBroker({ /* Supabase deps */ })
}
```

## 5. 撮合差异

| 维度 | PaperBroker | 真实券商 |
|---|---|---|
| 撮合时点 | cron `settle-pending` 主动撮合 | 由券商推送成交回报 |
| 涨跌停 | Phase 2 `matchFill` 算法 | 券商自然处理 |
| 整手化 | `matchFill` 处理 | 券商处理 |
| 费率 | `computeFee` 计算 | 直接从 fill 读 |
| 拒单 | 主动判定 | 券商回报拒单理由 |

## 6. T+1 兼容

实盘券商的 T+1 是自然规则,本设计无需特殊处理;只需保证:
- SELL 撮合时检查 `positions.available_shares`(实盘不会透支,但前端展示需要)
- `t1-settle` cron 仍然每天跑一次(`available_shares` 累加),与实盘不冲突

## 7. 接入测试

每个 `<broker>.ts` 需配 `<broker>.test.ts`,覆盖:
- submit / cancel / settle 状态机
- accountId / sessionToken(用 MSW 或本地 mock 券商)
- brokerKind() 返回正确字符串

## 8. 风险与合规

实盘接入前必须确认:
- 监管合规(投资者适当性、风险揭示书)
- 单账户单策略(本期设计假设;多账户需要扩展 portfolio)
- 大额订单人工确认(后续 phase,可加 `risk/rules.ts` 新规则)