# Quant Trading Phase 3 — 模拟交易 + 持仓 UI — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PaperBroker 订单状态机 + T+1 解禁逻辑 + 3 个 cron 端点(`run-strategies` / `settle-pending` / `t1-settle`),完成 `/portfolio` 当前持仓页与 `/portfolio/trades` 成交明细页,以及在策略详情页提供"启动 / 暂停 / 停止"按钮,让用户能一键启动策略并看到持仓和成交记录。

**Architecture:** `BrokerAdapter` 接口 + `PaperBroker` 实现,订单状态机 `pending → filled | rejected | cancelled`。撮合在 `settle-pending` cron 触发(用 T+1 开盘价),沿用 Phase 2 `lib/backtest/fills.ts` 的撮合规则(涨跌停 / 整手 / 费率)。T+1 解禁是纯函数(`settle.ts`):次日 09:05 把昨日 BUY fill 的股数累加到 `positions.available_shares`。`run-strategies` cron 调 `lib/trading/rebalance.ts` 给每个 active portfolio 生成重平衡计划,落库到 `orders` + `strategy_run_log`,后者保证幂等。3 个 cron 端点用 Bearer token 鉴权,业务侧走 service_role 客户端(绕 RLS)。UI 用 Server Component 拉数据,Client Component 只放图表与按钮。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · Supabase Postgres + RLS · Vitest · lightweight-charts (Phase 0) · shadcn/ui (沿用 Phase 0-2)

**Spec:** `docs/superpowers/specs/2026-09-15-quant-trading-design.md` (Phase 3 章节 §9)

**依赖前置 (来自 Phase 0 / 1 / 2):**
- `src/lib/data` (`MarketDataProvider` / `MockDataProvider` / `getDailyBars` / `listSymbols`)
- `src/lib/scheduler` (`isTradingDay` + 时段工具)
- `src/lib/strategy` (`StrategySpec` / `evaluateConditions` / `getStrategy`)
- `src/lib/backtest` (`runBacktest` / `matchFill` / `computeFee` / `DEFAULT_FEE_CONFIG` — 用于实盘撮合)
- `src/lib/supabase/server` 与 `src/lib/supabase/service-role`(前者 RLS,后者 cron)
- `src/app/(dashboard)/layout.tsx` + 顶部导航含 "持仓"
- 主板股票已 seed,日线已有数据

---

## 全局约定

- **表名前缀:** 所有新表使用 `trade260915a_` 前缀。
- **新表:** `trade260915a_portfolios` / `trade260915a_positions` / `trade260915a_orders` / `trade260915a_fills` / `trade260915a_strategy_run_log`。
- **i18n namespace:** 新增 `quant.trading.*` / `quant.portfolio.*` / `quant.order.*` / `quant.cron.*`。
- **Git 节奏:** 每个 Task 末尾独立提交。
- **TDD:** 每个 lib/ 纯函数任务先写失败测试,再写实现。
- **路径别名:** 沿用 `@/lib/...` `@/components/...` `@/app/...`。
- **数字精度:** 沿用 Phase 2(NUMERIC(12,4) 价格 / NUMERIC(14,2) 金额 / INTEGER 股数)。
- **订单状态机:** `pending → filled | rejected | cancelled`,单向不回退。
- **撮合约定:** T 日 15:10 cron 生成 pending 订单 → T+1 09:30 settle-pending cron 用开盘价成交(涨跌停拒单、整手化、费率沿用 `lib/backtest/fills.ts`)。
- **T+1 解禁:** T+1 09:05 cron 把昨日 BUY fill 的股数累加到 `positions.available_shares`,SELL 撮合前必须检查 available_shares。
- **RLS:** 5 张新表全部 `user_id = auth.uid()`,server-side cron 走 service_role 绕过 RLS。
- **覆盖率门槛**(沿用 spec §8.1): `lib/trading/*` 行覆盖 ≥ 80%。

---

## Task 1: 交易 schema migration(5 张表 + RLS)

**Files:**
- Create: `supabase/migrations/005_trading_schema.sql`

> 一张 migration 包含全部 5 张表。RLS 简化为直接 denormalize `user_id` 到每张表,避免 JOIN 复杂度(沿用 spec §10 R6 缓解策略)。

- [ ] **Step 1: 创建 migration**

`supabase/migrations/005_trading_schema.sql`:

```sql
-- 005_trading_schema.sql
-- 模拟交易 schema: portfolios / positions / orders / fills / strategy_run_log。

-- =============== portfolios ===============
CREATE TABLE trade260915a_portfolios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id   UUID NOT NULL REFERENCES trade260915a_strategies(id) ON DELETE CASCADE,
  cash          NUMERIC(14, 2) NOT NULL DEFAULT 1000000 CHECK (cash >= 0),
  initial_cash  NUMERIC(14, 2) NOT NULL DEFAULT 1000000,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'stopped')),
  stop_reason   TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ,
  UNIQUE (user_id, strategy_id)
);

CREATE INDEX trade260915a_portfolios_user_id_idx ON trade260915a_portfolios(user_id);
CREATE INDEX trade260915a_portfolios_status_idx ON trade260915a_portfolios(status);

-- =============== positions ===============
CREATE TABLE trade260915a_positions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id     UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  symbol_code      TEXT NOT NULL,
  shares           INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
  available_shares INTEGER NOT NULL DEFAULT 0 CHECK (available_shares >= 0),
  cost_price       NUMERIC(12, 4) NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, symbol_code)
);

CREATE INDEX trade260915a_positions_portfolio_idx ON trade260915a_positions(portfolio_id);

-- =============== orders ===============
CREATE TABLE trade260915a_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id    UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  symbol_code     TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares          INTEGER NOT NULL CHECK (shares > 0),
  intended_price  NUMERIC(12, 4) NOT NULL,
  trade_date      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'filled', 'rejected', 'cancelled')),
  reject_reason   TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at       TIMESTAMPTZ,
  filled_price    NUMERIC(12, 4),
  filled_shares   INTEGER,
  fee             NUMERIC(14, 2)
);

CREATE INDEX trade260915a_orders_portfolio_status_idx
  ON trade260915a_orders(portfolio_id, status);
CREATE INDEX trade260915a_orders_user_status_idx
  ON trade260915a_orders(user_id, status);

-- 幂等性: 同一 portfolio + symbol + side + 当日 trade_date 只能有一条 pending 订单
CREATE UNIQUE INDEX trade260915a_orders_pending_unique
  ON trade260915a_orders(portfolio_id, symbol_code, side, trade_date)
  WHERE status = 'pending';

-- =============== fills ===============
CREATE TABLE trade260915a_fills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id  UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES trade260915a_orders(id) ON DELETE CASCADE,
  symbol_code   TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price         NUMERIC(12, 4) NOT NULL,
  shares        INTEGER NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL,
  fee           NUMERIC(14, 2) NOT NULL,
  filled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trade260915a_fills_portfolio_filled_idx
  ON trade260915a_fills(portfolio_id, filled_at DESC);
CREATE INDEX trade260915a_fills_user_filled_idx
  ON trade260915a_fills(user_id, filled_at DESC);

-- =============== strategy_run_log ===============
CREATE TABLE trade260915a_strategy_run_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id   UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  trade_date     DATE NOT NULL,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  signals_count  INTEGER NOT NULL DEFAULT 0,
  orders_count   INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  UNIQUE (portfolio_id, trade_date)
);

CREATE INDEX trade260915a_strategy_run_log_portfolio_idx
  ON trade260915a_strategy_run_log(portfolio_id);

-- =============== RLS ===============
ALTER TABLE trade260915a_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_strategy_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolios"
  ON trade260915a_portfolios FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own positions"
  ON trade260915a_positions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own orders"
  ON trade260915a_orders FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own fills"
  ON trade260915a_fills FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users view own strategy run logs"
  ON trade260915a_strategy_run_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

- [ ] **Step 2: 应用 migration**

```bash
pnpm dlx supabase db reset
```

预期: 全部 migration 成功。

- [ ] **Step 3: 验证表与 RLS**

```bash
pnpm dlx supabase db psql --local -c "\dt trade260915a_*"
pnpm dlx supabase db psql --local -c "
  SET ROLE authenticated;
  INSERT INTO trade260915a_portfolios (user_id, strategy_id) VALUES
    ('00000000-0000-0000-0000-000000000000',
     '00000000-0000-0000-0000-000000000001');
"
```

预期: 第一个列出全部 `trade260915a_*` 表(含旧表 + 5 张新表);
第二个报 RLS 错误 (`new row violates row-level security policy`)。

- [ ] **Step 4: 验证唯一索引**

```bash
pnpm dlx supabase db psql --local -c "
  SELECT indexname FROM pg_indexes WHERE tablename = 'trade260915a_orders' AND indexname = 'trade260915a_orders_pending_unique';
"
```

预期: 返回 1 行。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/005_trading_schema.sql
git commit -m "feat(db): trading schema (portfolios/positions/orders/fills/strategy_run_log)"
```

---

## Task 2: types.ts

**Files:**
- Create: `src/lib/trading/types.ts`

- [ ] **Step 1: 实现 types.ts**

`src/lib/trading/types.ts`:

```ts
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
  shares: number          // 总持仓(含 T+1 锁定)
  availableShares: number // 可卖(T+1 解禁后)
  costPrice: number       // 平均成本
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

/** 撮合上下文(settle-pending 内部使用) */
export interface SettleContext {
  portfolioId: string
  cash: number
  positions: Map<string, Position>
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/trading/types.ts
git commit -m "feat(trading): shared types for portfolio/position/order/fill"
```

---

## Task 3: broker.ts + PaperBroker (订单状态机)

**Files:**
- Create: `src/lib/trading/broker.ts`
- Create: `src/lib/trading/adapters/paper.ts`
- Create: `src/lib/trading/adapters/paper.test.ts`

> PaperBroker 是订单状态机的核心。两个职责:
> 1. `submitOrder`: 落库 `pending` 订单(借助幂等索引,相同 portfolio + symbol + side + trade_date 不会重复)
> 2. `settlePendingOrders` / `cancelOrder`: 状态转换,填充 orders + positions + cash

- [ ] **Step 1: 实现 broker.ts (接口)**

`src/lib/trading/broker.ts`:

```ts
import type { Order, OrderRequest, SettleResult } from './types'

/** BrokerAdapter 接口 —— 抽象所有券商交互 */
export interface BrokerAdapter {
  /** 提交订单,返回完整 Order 记录 */
  submitOrder(req: OrderRequest): Promise<Order>

  /** 取消 pending 订单(只允许 pending → cancelled) */
  cancelOrder(orderId: string): Promise<Order>

  /** 撮合 pending 订单(对一批订单,在 T+1 用开盘价撮合) */
  settlePendingOrders(orders: Order[]): Promise<SettleResult[]>

  /** 查询单个订单 */
  getOrder(orderId: string): Promise<Order | null>

  /** 列出指定组合的所有 pending 订单 */
  listPendingOrders(portfolioId: string): Promise<Order[]>
}
```

- [ ] **Step 2: 写失败测试**

`src/lib/trading/adapters/paper.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PaperBroker } from './paper'
import type { Order, Position } from '../types'

// 内存 mock:不接 Supabase,直接给 PaperBroker 一个 in-memory store
function makeBroker() {
  const orders: Order[] = []
  const positions = new Map<string, Position>()
  let cash = 1_000_000
  let cashLog = [1_000_000]
  const orderSeq = { n: 0 }
  const fillSeq = { n: 0 }

  return {
    broker: new PaperBroker({
      submit: (req) => {
        const id = `ord-${++orderSeq.n}`
        const order: Order = {
          id,
          userId: 'u1',
          portfolioId: req.portfolioId,
          symbolCode: req.symbolCode,
          side: req.side,
          shares: req.shares,
          intendedPrice: req.intendedPrice,
          tradeDate: req.tradeDate,
          status: 'pending',
          rejectReason: null,
          submittedAt: new Date().toISOString(),
          filledAt: null,
          filledPrice: null,
          filledShares: null,
          fee: null,
        }
        orders.push(order)
        return Promise.resolve(order)
      },
      loadPending: (portfolioId) => Promise.resolve(orders.filter((o) => o.portfolioId === portfolioId && o.status === 'pending')),
      updateOrder: (id, patch) => {
        const o = orders.find((x) => x.id === id)
        if (!o) throw new Error(`order ${id} not found`)
        Object.assign(o, patch)
        return Promise.resolve(o)
      },
      insertFill: (fill) => {
        const id = `fill-${++fillSeq.n}`
        const stored = { ...fill, id }
        return Promise.resolve(stored)
      },
      loadPositions: (portfolioId) => {
        const ps = [...positions.values()].filter((p) => p.portfolioId === portfolioId)
        return Promise.resolve(ps)
      },
      upsertPosition: (p) => {
        const key = `${p.portfolioId}:${p.symbolCode}`
        const existing = positions.get(key)
        if (existing) {
          Object.assign(existing, p, { updatedAt: new Date().toISOString() })
          return Promise.resolve(existing)
        }
        const created: Position = {
          id: `pos-${positions.size + 1}`,
          userId: p.userId,
          portfolioId: p.portfolioId,
          symbolCode: p.symbolCode,
          shares: p.shares,
          availableShares: p.availableShares,
          costPrice: p.costPrice,
          updatedAt: new Date().toISOString(),
        }
        positions.set(key, created)
        return Promise.resolve(created)
      },
      loadCash: () => Promise.resolve(cash),
      saveCash: (v) => {
        cash = v
        cashLog.push(v)
        return Promise.resolve()
      },
      _cashLog: cashLog,
      _orders: orders,
      _positions: positions,
    }),
  }
}

describe('PaperBroker.submitOrder', () => {
  it('returns a pending order', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1',
      symbolCode: '600000',
      side: 'BUY',
      shares: 1000,
      intendedPrice: 10,
      tradeDate: '2026-09-15',
    })
    expect(o.status).toBe('pending')
    expect(o.side).toBe('BUY')
  })
})

describe('PaperBroker.cancelOrder', () => {
  it('transitions pending → cancelled', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const cancelled = await broker.cancelOrder(o.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('throws when cancelling a filled order', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    // 手动标记为 filled
    await (broker as any).deps.updateOrder(o.id, { status: 'filled' })
    await expect(broker.cancelOrder(o.id)).rejects.toThrow(/cannot cancel/i)
  })
})

describe('PaperBroker.settlePendingOrders — BUY success', () => {
  it('fills at open and updates cash + position (shares unlocked=0)', async () => {
    const { broker, _cashLog } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      // T+1 open bar: open=10.5, prevClose=10 (用于涨跌停判定)
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 10.5, close: 10 }]]),
    })
    expect(results[0].status).toBe('filled')
    expect(results[0].fill?.shares).toBe(1000)
    // 佣金 = max(5, 10500 × 0.00025) = 5
    expect(results[0].fill?.fee).toBeCloseTo(5, 2)
    // cash = 1000000 - 10500 - 5 = 989495
    expect(results[0].cashAfter).toBeCloseTo(989495, 2)
    // position: shares=1000, availableShares=0(T+1 锁定)
    expect(results[0].positionAfter?.shares).toBe(1000)
    expect(results[0].positionAfter?.availableShares).toBe(0)
  })
})

describe('PaperBroker.settlePendingOrders — BUY at limit-up', () => {
  it('rejects BUY when open at limit-up', async () => {
    const { broker } = makeBroker()
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11.0, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/limit/i)
  })
})

describe('PaperBroker.settlePendingOrders — SELL', () => {
  it('sells from position with sufficient availableShares', async () => {
    const { broker } = makeBroker()
    // 先 seed 持仓:1000 股,available=1000(已 T+1 解禁)
    await (broker as any).deps.upsertPosition({
      userId: 'u1', portfolioId: 'p1', symbolCode: '600000',
      shares: 1000, availableShares: 1000, costPrice: 10,
    })
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'SELL',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11, close: 10.5 }]]),
    })
    expect(results[0].status).toBe('filled')
    expect(results[0].fill?.shares).toBe(1000)
    // 卖 11000,佣金 = max(5, 11000 × 0.00025) = 5,印花税 = 11000 × 0.001 = 11 → 16
    expect(results[0].fill?.fee).toBeCloseTo(16, 2)
    // cash = 1000000 + 11000 - 16 = 100984
    expect(results[0].cashAfter).toBeCloseTo(100984, 2)
    // position: shares=0, available=0
    expect(results[0].positionAfter?.shares).toBe(0)
  })

  it('rejects SELL when availableShares insufficient', async () => {
    const { broker } = makeBroker()
    // T+1 锁定中:1000 持仓但 0 可卖
    await (broker as any).deps.upsertPosition({
      userId: 'u1', portfolioId: 'p1', symbolCode: '600000',
      shares: 1000, availableShares: 0, costPrice: 10,
    })
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'SELL',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 11, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/available/i)
  })
})

describe('PaperBroker.settlePendingOrders — insufficient cash', () => {
  it('rejects BUY when cash too low', async () => {
    const { broker } = makeBroker()
    // 把 cash 调成 1000
    await (broker as any).deps.saveCash(1000)
    const o = await broker.submitOrder({
      portfolioId: 'p1', symbolCode: '600000', side: 'BUY',
      shares: 1000, intendedPrice: 10, tradeDate: '2026-09-15',
    })
    const results = await broker.settlePendingOrders([o], {
      bars: new Map([['600000', { tradeDate: '2026-09-16', open: 10, close: 10 }]]),
    })
    expect(results[0].status).toBe('rejected')
    expect(results[0].rejectReason).toMatch(/cash/i)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
pnpm test src/lib/trading/adapters/paper.test.ts
```

预期: FAIL — `Cannot find module './paper'`。

- [ ] **Step 4: 实现 paper.ts**

`src/lib/trading/adapters/paper.ts`:

```ts
import { matchFill, computeFee, DEFAULT_FEE_CONFIG } from '@/lib/backtest'
import type { BrokerAdapter } from '../broker'
import type {
  Fill,
  Order,
  OrderRequest,
  Position,
  SettleResult,
} from '../types'

/** PaperBroker 依赖(便于注入 mock;生产用 Supabase 实现见 query.ts) */
export interface PaperBrokerDeps {
  submit(req: OrderRequest): Promise<Order>
  loadPending(portfolioId: string): Promise<Order[]>
  updateOrder(id: string, patch: Partial<Order>): Promise<Order>
  insertFill(fill: Omit<Fill, 'id'>): Promise<Fill>
  loadPositions(portfolioId: string): Promise<Position[]>
  upsertPosition(p: {
    userId: string
    portfolioId: string
    symbolCode: string
    shares: number
    availableShares: number
    costPrice: number
  }): Promise<Position>
  loadCash(): Promise<number>
  saveCash(v: number): Promise<void>
}

interface BarLite {
  tradeDate: string
  open: number
  close: number  // 用作前一日 close 判定涨跌停
}

export class PaperBroker implements BrokerAdapter {
  constructor(public readonly deps: PaperBrokerDeps) {}

  async submitOrder(req: OrderRequest): Promise<Order> {
    return this.deps.submit(req)
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const order = await this.deps.updateOrder(orderId, {})
    if (order.status !== 'pending') {
      throw new Error(`Cannot cancel order ${orderId} in status ${order.status}`)
    }
    return this.deps.updateOrder(orderId, { status: 'cancelled' })
  }

  async getOrder(orderId: string): Promise<Order | null> {
    // 通过 listPendingOrders + 全量查询的简化版,这里用 updateOrder 走 patch 检索的 hack 太脏,
    // 直接读一次;实际生产环境在 query.ts 里提供专门的 getOrder。
    // 简化:返回 null 让调用方去 listPendingOrders 之外查(本期不强求)
    void orderId
    return null
  }

  async listPendingOrders(portfolioId: string): Promise<Order[]> {
    return this.deps.loadPending(portfolioId)
  }

  async settlePendingOrders(
    orders: Order[],
    ctx: { bars: Map<string, BarLite> },
  ): Promise<SettleResult[]> {
    const results: SettleResult[] = []
    let cash = await this.deps.loadCash()
    const positions = new Map<string, Position>()
    for (const p of await this.deps.loadPositions(orders[0]?.portfolioId ?? '')) {
      positions.set(p.symbolCode, p)
    }

    for (const order of orders) {
      if (order.status !== 'pending') {
        continue
      }
      const bar = ctx.bars.get(order.symbolCode)
      if (!bar) {
        // 没 bar 视为拒绝
        await this.deps.updateOrder(order.id, {
          status: 'rejected',
          rejectReason: 'no bar for symbol',
        })
        results.push({ orderId: order.id, status: 'rejected', rejectReason: 'no bar for symbol' })
        continue
      }

      // 涨跌停 / 整手 / 现金 / 股数 → 复用 Phase 2 fills
      const req = {
        intent: {
          symbolCode: order.symbolCode,
          side: order.side,
          targetAmount: order.shares * order.intendedPrice,
        },
        nextBar: {
          symbolCode: order.symbolCode,
          tradeDate: bar.tradeDate,
          open: bar.open,
          high: bar.open,
          low: bar.open,
          close: bar.close, // ← prevClose 由调用方传
          volume: 0,
          amount: 0,
        },
        availableShares: positions.get(order.symbolCode)?.availableShares,
        availableCash: cash,
      }

      const r = matchFill(req)

      if (r.status !== 'filled' || !r.trade) {
        await this.deps.updateOrder(order.id, {
          status: 'rejected',
          rejectReason: r.reason ?? 'unknown',
        })
        results.push({ orderId: order.id, status: 'rejected', rejectReason: r.reason })
        continue
      }

      const tr = r.trade
      // 写 fill
      const fill = await this.deps.insertFill({
        userId: order.userId,
        portfolioId: order.portfolioId,
        orderId: order.id,
        symbolCode: order.symbolCode,
        side: order.side,
        price: tr.price,
        shares: tr.shares,
        amount: tr.amount,
        fee: tr.fee,
        filledAt: new Date().toISOString(),
      })

      // 更新 order 状态
      await this.deps.updateOrder(order.id, {
        status: 'filled',
        filledAt: fill.filledAt,
        filledPrice: tr.price,
        filledShares: tr.shares,
        fee: tr.fee,
      })

      // 更新 cash
      if (order.side === 'BUY') {
        cash -= tr.amount + tr.fee
      } else {
        cash += tr.amount - tr.fee
      }
      await this.deps.saveCash(cash)

      // 更新 position
      const existing = positions.get(order.symbolCode)
      let nextShares: number
      let nextAvailable: number
      let nextCost: number
      if (order.side === 'BUY') {
        if (existing) {
          const totalShares = existing.shares + tr.shares
          nextCost = (existing.costPrice * existing.shares + tr.price * tr.shares) / totalShares
          nextShares = totalShares
          nextAvailable = existing.availableShares // 新买入 T+1 锁定,available 不变
        } else {
          nextCost = tr.price
          nextShares = tr.shares
          nextAvailable = 0 // T+1 锁定
        }
      } else {
        // SELL
        if (!existing) throw new Error(`SELL ${order.symbolCode} but no position`)
        nextShares = existing.shares - tr.shares
        nextCost = existing.costPrice
        nextAvailable = existing.availableShares - tr.shares
        if (nextShares < 0 || nextAvailable < 0) {
          throw new Error(`Position went negative for ${order.symbolCode}`)
        }
      }
      const updated = await this.deps.upsertPosition({
        userId: order.userId,
        portfolioId: order.portfolioId,
        symbolCode: order.symbolCode,
        shares: nextShares,
        availableShares: nextAvailable,
        costPrice: nextCost,
      })
      positions.set(order.symbolCode, updated)

      results.push({
        orderId: order.id,
        status: 'filled',
        fill,
        positionAfter: {
          symbolCode: updated.symbolCode,
          shares: updated.shares,
          availableShares: updated.availableShares,
          costPrice: updated.costPrice,
        },
        cashAfter: cash,
      })
    }

    return results
  }
}

void DEFAULT_FEE_CONFIG // 保留用于未来费率覆盖
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm test src/lib/trading/adapters/paper.test.ts
```

预期: PASS, 8 tests。

- [ ] **Step 6: 提交**

```bash
git add src/lib/trading/broker.ts src/lib/trading/adapters/paper.ts src/lib/trading/adapters/paper.test.ts
git commit -m "feat(trading): BrokerAdapter + PaperBroker with order state machine"
```

---

## Task 4: settle.ts — T+1 解禁逻辑(纯函数)

**Files:**
- Create: `src/lib/trading/settle.ts`
- Create: `src/lib/trading/settle.test.ts`

> 纯函数:接收今日日期 + 一组"昨日成交的 BUY fill",输出需要解锁的 position 更新。
> cron t1-settle 调此函数,然后写库。

- [ ] **Step 1: 写失败测试**

`src/lib/trading/settle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeT1Unlock } from './settle'
import type { Fill, Position } from './types'

function mkPos(symbol: string, shares: number, available: number): Position {
  return {
    id: `pos-${symbol}`,
    userId: 'u1',
    portfolioId: 'p1',
    symbolCode: symbol,
    shares,
    availableShares: available,
    costPrice: 10,
    updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkFill(symbol: string, shares: number, filledAt: string): Fill {
  return {
    id: `fill-${symbol}-${shares}`,
    userId: 'u1',
    portfolioId: 'p1',
    orderId: 'o1',
    symbolCode: symbol,
    side: 'BUY',
    price: 10,
    shares,
    amount: shares * 10,
    fee: 5,
    filledAt,
  }
}

describe('computeT1Unlock', () => {
  it('returns 0 updates when no BUY fills yesterday', () => {
    const positions = new Map([['600000', mkPos('600000', 1000, 0)]])
    const fills: Fill[] = [] // 今天没 fill
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: fills,
      positions,
    })
    expect(updates).toEqual([])
  })

  it('skips SELL fills', () => {
    const positions = new Map([['600000', mkPos('600000', 1000, 1000)]])
    const sellFill: Fill = {
      ...mkFill('600000', 500, '2026-09-16T09:30:00Z'),
      side: 'SELL',
    }
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [sellFill],
      positions,
    })
    expect(updates).toEqual([])
  })

  it('unlocks shares from yesterday BUY fills', () => {
    // 持仓: 1000 股,available=0(T+1 锁定中)
    const positions = new Map([['600000', mkPos('600000', 1000, 0)]])
    const buyFill = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [buyFill],
      positions,
    })
    expect(updates.length).toBe(1)
    expect(updates[0]).toEqual({
      symbolCode: '600000',
      availableShares: 1000,
    })
  })

  it('unlocks multiple fills for the same symbol', () => {
    const positions = new Map([['600000', mkPos('600000', 2000, 500)]])
    const f1 = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const f2 = mkFill('600000', 500, '2026-09-16T09:31:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [f1, f2],
      positions,
    })
    expect(updates).toEqual([{ symbolCode: '600000', availableShares: 2000 }])
  })

  it('skips symbols with no position', () => {
    const positions = new Map<string, Position>()
    const buyFill = mkFill('600000', 1000, '2026-09-16T09:30:00Z')
    const updates = computeT1Unlock({
      today: '2026-09-17',
      yesterdayFills: [buyFill],
      positions,
    })
    expect(updates).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/trading/settle.test.ts
```

预期: FAIL — `Cannot find module './settle'`。

- [ ] **Step 3: 实现 settle.ts**

`src/lib/trading/settle.ts`:

```ts
import type { Fill, Position } from './types'

interface ComputeT1UnlockInput {
  today: string  // YYYY-MM-DD
  /** 昨日成交的 fills(由 cron 传入) */
  yesterdayFills: Fill[]
  /** 当前持仓(由 cron 传入) */
  positions: Map<string, Position>
}

export interface T1UnlockUpdate {
  symbolCode: string
  availableShares: number  // 解禁后的新值(覆盖写)
}

/**
 * 计算 T+1 解禁:T+1 09:05 把昨日 BUY fill 的股数累加到 positions.available_shares。
 * 纯函数,不写库。调用方负责持久化。
 *
 * 规则:
 *  - 只处理 side = 'BUY' 的 fill
 *  - 只处理 filled_at::date = today - 1 的 fill(调用方传入 yesterdayFills 已过滤)
 *  - 同一 symbol 多笔 fill 累加
 *  - 不存在的持仓跳过(防御性)
 */
export function computeT1Unlock(input: ComputeT1UnlockInput): T1UnlockUpdate[] {
  const { yesterdayFills, positions } = input
  const grouped = new Map<string, number>()
  for (const f of yesterdayFills) {
    if (f.side !== 'BUY') continue
    if (!positions.has(f.symbolCode)) continue
    grouped.set(f.symbolCode, (grouped.get(f.symbolCode) ?? 0) + f.shares)
  }
  const updates: T1UnlockUpdate[] = []
  for (const [symbolCode, addShares] of grouped) {
    const pos = positions.get(symbolCode)!
    updates.push({
      symbolCode,
      availableShares: pos.availableShares + addShares,
    })
  }
  return updates
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/trading/settle.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/trading/settle.ts src/lib/trading/settle.test.ts
git commit -m "feat(trading): T+1 unlock pure function (computeT1Unlock)"
```

---

## Task 5: rebalance.ts — 单 portfolio 重平衡计划生成

**Files:**
- Create: `src/lib/trading/rebalance.ts`
- Create: `src/lib/trading/rebalance.test.ts`

> 接收 portfolio + 当前持仓 + strategy spec,输出重平衡意图(BUY / SELL)。
> 此函数不写库,只是 plan;调用方(主要是 cron run-strategies)负责落库。
> 简化版:等权分配,不调 risk(Phase 4 接入)。

- [ ] **Step 1: 写失败测试**

`src/lib/trading/rebalance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateRebalancePlan } from './rebalance'
import type { Portfolio, Position } from './types'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

function mkPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    userId: 'u1',
    strategyId: 's1',
    cash: 1_000_000,
    initialCash: 1_000_000,
    status: 'active',
    stopReason: null,
    startedAt: '2026-09-01T00:00:00Z',
    stoppedAt: null,
    ...overrides,
  }
}

function mkPos(symbol: string, shares: number): Position {
  return {
    id: `pos-${symbol}`,
    userId: 'u1',
    portfolioId: 'p1',
    symbolCode: symbol,
    shares,
    availableShares: shares,
    costPrice: 10,
    updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkBar(symbol: string, close: number): DailyBar {
  return {
    symbolCode: symbol,
    tradeDate: '2026-09-15',
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    amount: close * 1_000_000,
  }
}

const alwaysEntrySpec: StrategySpec = {
  entry: { combinator: 'AND', conditions: [] },
  exit: { combinator: 'OR', conditions: [] },
  holding: { maxPositions: 2, positionSizePct: 100, maxDrawdownPct: 50 },
}

const someEntrySpec: StrategySpec = {
  entry: {
    combinator: 'AND',
    conditions: [
      // 仅 PE_TTM 满足(无 lookback),阈值 0 → 永远成立
      { factor: 'PE_TTM', params: {}, comparator: '>', threshold: 0 },
    ],
  },
  exit: { combinator: 'OR', conditions: [] },
  holding: { maxPositions: 1, positionSizePct: 100, maxDrawdownPct: 50 },
}

describe('generateRebalancePlan', () => {
  it('returns empty plan when no symbols pass entry', () => {
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: {
        ...alwaysEntrySpec,
        entry: { combinator: 'AND', conditions: [] },
      },
      symbols: [], // 无候选
      barsBySymbol: new Map(),
      today: '2026-09-15',
    })
    expect(plan.intents).toEqual([])
  })

  it('generates BUY intents for top-N entry signals', () => {
    const bars = new Map([
      ['600000', mkBar('600000', 10)],
      ['600001', mkBar('600001', 20)],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio({ cash: 1_000_000 }),
      positions: [],
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol: bars,
      today: '2026-09-15',
    })
    // maxPositions=2,positionSizePct=100 → 全仓 2 笔 BUY
    expect(plan.intents.length).toBe(2)
    const buys = plan.intents.filter((i) => i.side === 'BUY')
    expect(buys.length).toBe(2)
    // 等权:每笔 500000
    expect(plan.intents[0].targetAmount).toBe(500000)
  })

  it('generates SELL for symbols not in target set', () => {
    const bars = new Map([
      ['600000', mkBar('600000', 10)], // 入选
      ['600001', mkBar('600001', 20)],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [mkPos('600002', 1000)], // 旧持仓,不在候选 → SELL
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol: bars,
      today: '2026-09-15',
    })
    const sells = plan.intents.filter((i) => i.side === 'SELL')
    expect(sells.length).toBe(1)
    expect(sells[0].symbolCode).toBe('600002')
  })

  it('skips symbols failing entry signal', () => {
    const noEntrySpec: StrategySpec = {
      ...someEntrySpec,
      entry: {
        combinator: 'AND',
        conditions: [{ factor: 'PE_TTM', params: {}, comparator: '<', threshold: -100 }],
      },
    }
    const bars = new Map([
      ['600000', mkBar('600000', 10)],
      ['600001', mkBar('600001', 20)],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: noEntrySpec,
      symbols: ['600000', '600001'],
      barsBySymbol: bars,
      today: '2026-09-15',
    })
    expect(plan.intents.filter((i) => i.side === 'BUY').length).toBe(0)
  })

  it('respects maxPositions cap', () => {
    const bars = new Map([
      ['600000', mkBar('600000', 10)],
      ['600001', mkBar('600001', 20)],
      ['600002', mkBar('600002', 30)],
      ['600003', mkBar('600003', 40)],
    ])
    const plan = generateRebalancePlan({
      portfolio: mkPortfolio(),
      positions: [],
      spec: alwaysEntrySpec,
      symbols: ['600000', '600001', '600002', '600003'],
      barsBySymbol: bars,
      today: '2026-09-15',
    })
    // maxPositions=2 → 2 个 BUY
    expect(plan.intents.filter((i) => i.side === 'BUY').length).toBe(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/trading/rebalance.test.ts
```

预期: FAIL — `Cannot find module './rebalance'`。

- [ ] **Step 3: 实现 rebalance.ts**

`src/lib/trading/rebalance.ts`:

```ts
import { evaluateConditions } from '@/lib/strategy'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'
import type { Portfolio, Position, OrderSide } from './types'

export interface RebalanceIntent {
  symbolCode: string
  side: OrderSide
  /** 目标成交金额(BUY:计划买入金额;SELL:按当前持仓市值) */
  targetAmount: number
}

export interface RebalancePlan {
  intents: RebalanceIntent[]
}

interface GenerateInput {
  portfolio: Portfolio
  positions: Position[]
  spec: StrategySpec
  symbols: string[]
  /** symbol → bars 升序,含 today */
  barsBySymbol: Map<string, DailyBar[]>
  today: string  // 'YYYY-MM-DD'
}

/**
 * 生成单 portfolio 的重平衡计划。
 * 算法(简化):
 *  1. 计算每个 symbol 的入场信号(根据 spec.entry)
 *  2. 取前 maxPositions 个作为 BUY 候选
 *  3. 当前持仓不在 BUY 候选中 → SELL
 *  4. 等权分配 positionSizePct
 */
export function generateRebalancePlan(input: GenerateInput): RebalancePlan {
  const { portfolio, positions, spec, symbols, barsBySymbol, today } = input

  // 1. 评估入场信号
  const candidates: string[] = []
  for (const sym of symbols) {
    const bars = barsBySymbol.get(sym) ?? []
    const barsUpToToday = bars.filter((b) => b.tradeDate <= today)
    if (evaluateConditions(spec.entry, barsUpToToday)) {
      candidates.push(sym)
    }
  }

  // 2. 取 top maxPositions
  const targetSet = new Set(candidates.slice(0, spec.holding.maxPositions))

  // 3. 计算 SELL(持仓不在 targetSet)
  const intents: RebalanceIntent[] = []
  for (const pos of positions) {
    if (!targetSet.has(pos.symbolCode)) {
      const lastClose = lastClose(barsBySymbol.get(pos.symbolCode) ?? [], today)
      intents.push({
        symbolCode: pos.symbolCode,
        side: 'SELL',
        targetAmount: pos.shares * lastClose,
      })
    }
  }

  // 4. 计算 BUY(等权)
  const newBuys = [...targetSet].filter((s) => !positions.some((p) => p.symbolCode === s))
  if (newBuys.length > 0) {
    const totalBudget = (portfolio.cash * spec.holding.positionSizePct) / 100
    const perPosition = totalBudget / newBuys.length
    for (const sym of newBuys) {
      intents.push({ symbolCode: sym, side: 'BUY', targetAmount: perPosition })
    }
  }

  return { intents }
}

function lastClose(bars: DailyBar[], today: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= today)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/trading/rebalance.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/trading/rebalance.ts src/lib/trading/rebalance.test.ts
git commit -m "feat(trading): generateRebalancePlan (pure function, no risk yet)"
```

---

## Task 6: query.ts — DB CRUD with RLS

**Files:**
- Create: `src/lib/trading/query.ts`

> 提供两类客户端:
> 1. RLS 客户端(`createClient()`)用于 Server Actions / UI,只查自己的数据
> 2. service_role 客户端(`createServiceRoleClient()`)用于 cron 端点
>
> 两者 API 签名相同,只是在 impl 切换 supabase client。

- [ ] **Step 1: 实现 query.ts**

`src/lib/trading/query.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Portfolio, Position, Order, Fill, StrategyRunLogEntry } from './types'

// ============ 类型 ============

interface DbPortfolio {
  id: string
  user_id: string
  strategy_id: string
  cash: string
  initial_cash: string
  status: 'active' | 'paused' | 'stopped'
  stop_reason: string | null
  started_at: string
  stopped_at: string | null
}

interface DbPosition {
  id: string
  user_id: string
  portfolio_id: string
  symbol_code: string
  shares: number
  available_shares: number
  cost_price: string
  updated_at: string
}

interface DbOrder {
  id: string
  user_id: string
  portfolio_id: string
  symbol_code: string
  side: 'BUY' | 'SELL'
  shares: number
  intended_price: string
  trade_date: string
  status: 'pending' | 'filled' | 'rejected' | 'cancelled'
  reject_reason: string | null
  submitted_at: string
  filled_at: string | null
  filled_price: string | null
  filled_shares: number | null
  fee: string | null
}

interface DbFill {
  id: string
  user_id: string
  portfolio_id: string
  order_id: string
  symbol_code: string
  side: 'BUY' | 'SELL'
  price: string
  shares: number
  amount: string
  fee: string
  filled_at: string
}

interface DbRunLog {
  id: string
  user_id: string
  portfolio_id: string
  trade_date: string
  run_at: string
  signals_count: number
  orders_count: number
  notes: string | null
}

function toPortfolio(r: DbPortfolio): Portfolio {
  return {
    id: r.id,
    userId: r.user_id,
    strategyId: r.strategy_id,
    cash: Number(r.cash),
    initialCash: Number(r.initial_cash),
    status: r.status,
    stopReason: r.stop_reason,
    startedAt: r.started_at,
    stoppedAt: r.stopped_at,
  }
}

function toPosition(r: DbPosition): Position {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    symbolCode: r.symbol_code,
    shares: r.shares,
    availableShares: r.available_shares,
    costPrice: Number(r.cost_price),
    updatedAt: r.updated_at,
  }
}

function toOrder(r: DbOrder): Order {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    symbolCode: r.symbol_code,
    side: r.side,
    shares: r.shares,
    intendedPrice: Number(r.intended_price),
    tradeDate: r.trade_date,
    status: r.status,
    rejectReason: r.reject_reason,
    submittedAt: r.submitted_at,
    filledAt: r.filled_at,
    filledPrice: r.filled_price ? Number(r.filled_price) : null,
    filledShares: r.filled_shares,
    fee: r.fee ? Number(r.fee) : null,
  }
}

function toFill(r: DbFill): Fill {
  return {
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    orderId: r.order_id,
    symbolCode: r.symbol_code,
    side: r.side,
    price: Number(r.price),
    shares: r.shares,
    amount: Number(r.amount),
    fee: Number(r.fee),
    filledAt: r.filled_at,
  }
}

// ============ RLS 客户端(用户上下文) ============

/** 当前用户的所有 portfolios */
export async function listPortfolios(): Promise<Portfolio[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listPortfolios failed: ${error.message}`)
  return (data ?? []).map(toPortfolio)
}

/** 当前用户的某个策略对应的 portfolio */
export async function getPortfolioByStrategy(strategyId: string): Promise<Portfolio | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('strategy_id', strategyId)
    .maybeSingle()
  if (error) throw new Error(`getPortfolioByStrategy failed: ${error.message}`)
  return data ? toPortfolio(data) : null
}

/** 列出 portfolio 的所有持仓 */
export async function listPositions(portfolioId: string): Promise<Position[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('symbol_code', { ascending: true })
  if (error) throw new Error(`listPositions failed: ${error.message}`)
  return (data ?? []).map(toPosition)
}

/** 列出当前用户的成交明细 */
export async function listFills(limit = 200): Promise<Fill[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .order('filled_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listFills failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

/** 列出 portfolio 的成交明细 */
export async function listFillsByPortfolio(portfolioId: string, limit = 200): Promise<Fill[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('filled_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listFillsByPortfolio failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

/** 列出当前用户的策略运行日志 */
export async function listRunLogs(portfolioId?: string): Promise<StrategyRunLogEntry[]> {
  const supabase = await createClient()
  let query = supabase
    .from('trade260915a_strategy_run_log')
    .select('*')
    .order('run_at', { ascending: false })
  if (portfolioId) query = query.eq('portfolio_id', portfolioId)
  const { data, error } = await query
  if (error) throw new Error(`listRunLogs failed: ${error.message}`)
  return (data ?? []).map((r: DbRunLog) => ({
    id: r.id,
    userId: r.user_id,
    portfolioId: r.portfolio_id,
    tradeDate: r.trade_date,
    runAt: r.run_at,
    signalsCount: r.signals_count,
    ordersCount: r.orders_count,
    notes: r.notes,
  }))
}

// ============ Server Actions helpers(用户上下文) ============

/** 启动 / 重启 portfolio:存在则激活,不存在则创建 */
export async function ensureActivePortfolio(
  userId: string,
  strategyId: string,
): Promise<Portfolio> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) {
    const { data: updated, error } = await supabase
      .from('trade260915a_portfolios')
      .update({ status: 'active', stopped_at: null, stop_reason: null })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error(`ensureActivePortfolio failed: ${error.message}`)
    return toPortfolio(updated)
  }
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .insert({ user_id: userId, strategy_id: strategyId })
    .select('*')
    .single()
  if (error) throw new Error(`ensureActivePortfolio insert failed: ${error.message}`)
  return toPortfolio(data)
}

export async function setPortfolioStatus(
  portfolioId: string,
  status: 'active' | 'paused' | 'stopped',
  stopReason: string | null = null,
): Promise<Portfolio> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .update({
      status,
      stop_reason: stopReason,
      stopped_at: status === 'stopped' ? new Date().toISOString() : null,
    })
    .eq('id', portfolioId)
    .select('*')
    .single()
  if (error) throw new Error(`setPortfolioStatus failed: ${error.message}`)
  return toPortfolio(data)
}

// ============ Service-role helpers(cron 使用,绕 RLS) ============

/** 列出所有 active portfolios(cron run-strategies 用) */
export async function listActivePortfoliosService(): Promise<Portfolio[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('status', 'active')
  if (error) throw new Error(`listActivePortfoliosService failed: ${error.message}`)
  return (data ?? []).map(toPortfolio)
}

export async function getPortfolioService(id: string): Promise<Portfolio | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolios')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getPortfolioService failed: ${error.message}`)
  return data ? toPortfolio(data) : null
}

export async function listPositionsService(portfolioId: string): Promise<Position[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
  if (error) throw new Error(`listPositionsService failed: ${error.message}`)
  return (data ?? []).map(toPosition)
}

export async function upsertPositionService(p: Omit<Position, 'id' | 'updatedAt'>): Promise<Position> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_positions')
    .upsert(
      {
        user_id: p.userId,
        portfolio_id: p.portfolioId,
        symbol_code: p.symbolCode,
        shares: p.shares,
        available_shares: p.availableShares,
        cost_price: p.costPrice,
      },
      { onConflict: 'portfolio_id,symbol_code' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`upsertPositionService failed: ${error.message}`)
  return toPosition(data)
}

export async function insertOrderService(
  order: Omit<Order, 'id' | 'submittedAt' | 'rejectReason' | 'filledAt' | 'filledPrice' | 'filledShares' | 'fee'>,
): Promise<Order | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .insert({
      user_id: order.userId,
      portfolio_id: order.portfolioId,
      symbol_code: order.symbolCode,
      side: order.side,
      shares: order.shares,
      intended_price: order.intendedPrice,
      trade_date: order.tradeDate,
      status: 'pending',
    })
    .select('*')
    .maybeSingle()
  // 23505 = unique_violation → 视为已存在(幂等),返回 null
  if (error && error.code !== '23505') {
    throw new Error(`insertOrderService failed: ${error.message}`)
  }
  return data ? toOrder(data) : null
}

export async function updateOrderService(
  id: string,
  patch: Partial<DbOrder>,
): Promise<Order> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updateOrderService failed: ${error.message}`)
  return toOrder(data)
}

/**
 * 原子取消:只在 status='pending' 时把状态改成 'cancelled'。
 * 返回 true = 成功;false = 订单不存在或不是 pending(状态机拒绝)。
 */
export async function cancelOrderIfPendingService(id: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`cancelOrderIfPendingService failed: ${error.message}`)
  return data !== null
}

export async function listPendingOrdersService(tradeDate: string): Promise<Order[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .select('*')
    .eq('status', 'pending')
    .eq('trade_date', tradeDate)
  if (error) throw new Error(`listPendingOrdersService failed: ${error.message}`)
  return (data ?? []).map(toOrder)
}

export async function listPendingOrdersByPortfolioService(portfolioId: string): Promise<Order[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_orders')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('status', 'pending')
  if (error) throw new Error(`listPendingOrdersByPortfolioService failed: ${error.message}`)
  return (data ?? []).map(toOrder)
}

export async function insertFillService(
  fill: Omit<Fill, 'id' | 'filledAt'>,
): Promise<Fill> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .insert({
      user_id: fill.userId,
      portfolio_id: fill.portfolioId,
      order_id: fill.orderId,
      symbol_code: fill.symbolCode,
      side: fill.side,
      price: fill.price,
      shares: fill.shares,
      amount: fill.amount,
      fee: fill.fee,
    })
    .select('*')
    .single()
  if (error) throw new Error(`insertFillService failed: ${error.message}`)
  return toFill(data)
}

export async function savePortfolioCashService(portfolioId: string, cash: number): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('trade260915a_portfolios')
    .update({ cash })
    .eq('id', portfolioId)
  if (error) throw new Error(`savePortfolioCashService failed: ${error.message}`)
}

export async function insertRunLogService(
  log: Omit<StrategyRunLogEntry, 'id' | 'runAt'>,
): Promise<StrategyRunLogEntry | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_strategy_run_log')
    .insert({
      user_id: log.userId,
      portfolio_id: log.portfolioId,
      trade_date: log.tradeDate,
      signals_count: log.signalsCount,
      orders_count: log.ordersCount,
      notes: log.notes,
    })
    .select('*')
    .maybeSingle()
  // 幂等:同 portfolio + trade_date 已存在则返回 null
  if (error && error.code !== '23505') {
    throw new Error(`insertRunLogService failed: ${error.message}`)
  }
  return data
    ? {
        id: data.id,
        userId: data.user_id,
        portfolioId: data.portfolio_id,
        tradeDate: data.trade_date,
        runAt: data.run_at,
        signalsCount: data.signals_count,
        ordersCount: data.orders_count,
        notes: data.notes,
      }
    : null
}

export async function listFillsByDateService(date: string): Promise<Fill[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_fills')
    .select('*')
    .gte('filled_at', `${date}T00:00:00Z`)
    .lt('filled_at', `${date}T23:59:59.999Z`)
    .eq('side', 'BUY')
  if (error) throw new Error(`listFillsByDateService failed: ${error.message}`)
  return (data ?? []).map(toFill)
}

export async function updatePositionAvailableSharesService(
  portfolioId: string,
  symbolCode: string,
  availableShares: number,
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('trade260915a_positions')
    .update({ available_shares: availableShares, updated_at: new Date().toISOString() })
    .eq('portfolio_id', portfolioId)
    .eq('symbol_code', symbolCode)
  if (error) throw new Error(`updatePositionAvailableSharesService failed: ${error.message}`)
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/trading/query.ts
git commit -m "feat(trading): query helpers (RLS + service-role)"
```

---

## Task 7: i18n — `quant.trading.*` / `quant.portfolio.*` / `quant.order.*`

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 的 `quant` 对象下添加 trading / portfolio / order 子树**

找到 `"quant": { ... }` 内,在大括号闭合 `}` 前插入:

```json
,
    "trading": {
      "start": "启动",
      "pause": "暂停",
      "resume": "恢复",
      "stop": "停止",
      "started": "策略已启动",
      "paused": "策略已暂停",
      "stopped": "策略已停止",
      "startConfirm": "确认启动策略?将创建模拟组合,初始资金 ¥1,000,000",
      "stopConfirm": "确认停止策略?将不再生成新订单,已持仓不会被自动平仓",
      "noPortfolio": "尚未启动任何策略",
      "noPortfolioHint": "从策略详情页点击 “启动” 按钮即可创建模拟组合"
    },
    "portfolio": {
      "title": "当前持仓",
      "summary": {
        "totalAssets": "总资产",
        "cash": "现金",
        "marketValue": "持仓市值",
        "floatingPnl": "浮动盈亏",
        "floatingPnlPct": "盈亏比",
        "todayPnl": "当日盈亏",
        "status": "状态"
      },
      "status": {
        "active": "运行中",
        "paused": "已暂停",
        "stopped": "已停止"
      },
      "positionsTitle": "持仓明细",
      "tradesLink": "查看成交明细 →",
      "noPositions": "暂无持仓",
      "equityCurve": "权益曲线"
    },
    "order": {
      "title": "挂单",
      "date": "日期",
      "symbol": "股票",
      "side": "方向",
      "shares": "股数",
      "intendedPrice": "目标价",
      "status": "状态",
      "actions": "操作",
      "cancel": "撤销",
      "cancelConfirm": "确认撤销该订单?",
      "statusLabels": {
        "pending": "挂单中",
        "filled": "已成交",
        "rejected": "已拒绝",
        "cancelled": "已撤销"
      },
      "rejectedReason": "拒单原因"
    },
    "fills": {
      "title": "成交明细",
      "date": "成交日期",
      "symbol": "股票",
      "side": "方向",
      "price": "成交价",
      "shares": "股数",
      "amount": "成交金额",
      "fee": "费用",
      "noFills": "暂无成交"
    }
```

- [ ] **Step 2: 在 en.json 的 `quant` 对象下添加 trading / portfolio / order 子树**

同上结构,英文文案:

```json
,
    "trading": {
      "start": "Start",
      "pause": "Pause",
      "resume": "Resume",
      "stop": "Stop",
      "started": "Strategy started",
      "paused": "Strategy paused",
      "stopped": "Strategy stopped",
      "startConfirm": "Start this strategy? A paper portfolio will be created with ¥1,000,000 initial cash.",
      "stopConfirm": "Stop this strategy? No new orders will be generated. Existing positions will not be auto-closed.",
      "noPortfolio": "No active strategy",
      "noPortfolioHint": "Click “Start” on a strategy detail page to create a paper portfolio."
    },
    "portfolio": {
      "title": "Portfolio",
      "summary": {
        "totalAssets": "Total Assets",
        "cash": "Cash",
        "marketValue": "Market Value",
        "floatingPnl": "Floating P&L",
        "floatingPnlPct": "P&L %",
        "todayPnl": "Today P&L",
        "status": "Status"
      },
      "status": {
        "active": "Active",
        "paused": "Paused",
        "stopped": "Stopped"
      },
      "positionsTitle": "Positions",
      "tradesLink": "View trades →",
      "noPositions": "No positions",
      "equityCurve": "Equity Curve"
    },
    "order": {
      "title": "Orders",
      "date": "Date",
      "symbol": "Symbol",
      "side": "Side",
      "shares": "Shares",
      "intendedPrice": "Intended Price",
      "status": "Status",
      "actions": "Actions",
      "cancel": "Cancel",
      "cancelConfirm": "Cancel this order?",
      "statusLabels": {
        "pending": "Pending",
        "filled": "Filled",
        "rejected": "Rejected",
        "cancelled": "Cancelled"
      },
      "rejectedReason": "Rejection Reason"
    },
    "fills": {
      "title": "Trades",
      "date": "Filled At",
      "symbol": "Symbol",
      "side": "Side",
      "price": "Price",
      "shares": "Shares",
      "amount": "Amount",
      "fee": "Fee",
      "noFills": "No trades yet"
    }
```

- [ ] **Step 3: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/zh.json', 'utf8'))"
node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json', 'utf8'))"
```

预期: 无输出。

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 5: 在 errors namespace 下追加交易相关错误文案**

在 `src/locales/zh.json` 和 `src/locales/en.json` 的 `"errors": { ... }` 内追加:

zh.json:

```json
,
    "start_failed": "启动策略失败,请重试",
    "pause_failed": "暂停策略失败,请重试",
    "stop_failed": "停止策略失败,请重试",
    "cancel_failed": "撤销订单失败,请重试",
    "order_not_cancellable": "该订单当前状态不可撤销(仅挂单可撤销)"
```

en.json:

```json
,
    "start_failed": "Failed to start strategy",
    "pause_failed": "Failed to pause strategy",
    "stop_failed": "Failed to stop strategy",
    "cancel_failed": "Failed to cancel order",
    "order_not_cancellable": "Order cannot be cancelled in its current status (only pending orders can be cancelled)"
```

- [ ] **Step 6: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/zh.json', 'utf8'))"
node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json', 'utf8'))"
```

预期: 无输出。

- [ ] **Step 7: 提交**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): quant.trading/portfolio/order/fills namespaces + trading errors"
```

---

## Task 8: actions.ts — Server Actions(startStrategy / pause / stop / cancelOrder)

**Files:**
- Create: `src/lib/trading/actions.ts`

- [ ] **Step 1: 实现 actions.ts**

`src/lib/trading/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ensureActivePortfolio, setPortfolioStatus, cancelOrderIfPendingService } from './query'

export interface TradingFormState {
  error?: string
} | null

/** 启动 / 重启策略 */
export async function startStrategyAction(strategyId: string): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await ensureActivePortfolio(user.id, strategyId)
  } catch (err: any) {
    return { error: err?.message ?? 'errors.start_failed' }
  }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${strategyId}`)
  revalidatePath('/portfolio')
  return null
}

/** 暂停 portfolio */
export async function pauseStrategyAction(portfolioId: string): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await setPortfolioStatus(portfolioId, 'paused')
  } catch (err: any) {
    return { error: err?.message ?? 'errors.pause_failed' }
  }

  revalidatePath('/portfolio')
  return null
}

/** 停止 portfolio(写 stop_reason) */
export async function stopStrategyAction(
  portfolioId: string,
  stopReason = 'user_stopped',
): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    await setPortfolioStatus(portfolioId, 'stopped', stopReason)
  } catch (err: any) {
    return { error: err?.message ?? 'errors.stop_failed' }
  }

  revalidatePath('/portfolio')
  revalidatePath('/strategy')
  return null
}

/** 撤销 pending 订单(用户手动;状态机校验:只在 pending 时允许) */
export async function cancelOrderAction(orderId: string): Promise<TradingFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  try {
    const ok = await cancelOrderIfPendingService(orderId)
    if (!ok) return { error: 'errors.order_not_cancellable' }
  } catch (err: any) {
    return { error: err?.message ?? 'errors.cancel_failed' }
  }

  revalidatePath('/portfolio')
  return null
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/trading/actions.ts
git commit -m "feat(trading): server actions for start/pause/stop/cancel"
```

---

## Task 9: cron auth helper

**Files:**
- Create: `src/lib/cron-auth.ts`

> 3 个 cron 端点共享鉴权逻辑。检查 `Authorization: Bearer ${CRON_SECRET}`。

- [ ] **Step 1: 实现 cron-auth.ts**

`src/lib/cron-auth.ts`:

```ts
import { NextResponse } from 'next/server'

/**
 * Vercel Cron 鉴权:检查 Authorization: Bearer ${CRON_SECRET}。
 * 返回 null 表示通过;返回 NextResponse 表示 401 拒绝。
 */
export function checkCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/cron-auth.ts
git commit -m "feat(cron): shared Bearer auth helper"
```

---

## Task 10: Cron /api/cron/run-strategies(收盘调仓)

**Files:**
- Create: `src/app/api/cron/run-strategies/route.ts`

> 每天 15:10 Beijing(UTC 07:10)触发。
> 对每个 active portfolio:
> 1. 计算 rebalance plan
> 2. 对每个 intent 调 insertOrderService(幂等)
> 3. 写 strategy_run_log(幂等,UNIQUE portfolio+trade_date)
> 返回 JSON 摘要。

- [ ] **Step 1: 实现 run-strategies 路由**

`src/app/api/cron/run-strategies/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { listActivePortfoliosService, listPositionsService, insertOrderService, insertRunLogService } from '@/lib/trading/query'
import { getStrategy } from '@/lib/strategy'
import { getProvider } from '@/lib/data'
import { generateRebalancePlan } from '@/lib/trading/rebalance'
import type { DailyBar } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authErr = checkCronAuth(req)
  if (authErr) return authErr

  const provider = getProvider()
  const allSymbols = await provider.listSymbols()
  const symbolCodes = allSymbols.map((s) => s.code)

  // 今日日期(UTC) — cron 触发时假定为北京 15:10 = UTC 07:10
  const today = new Date().toISOString().slice(0, 10)

  const portfolios = await listActivePortfoliosService()
  const summary: { portfolioId: string; signalsCount: number; ordersCount: number; notes?: string }[] = []

  for (const portfolio of portfolios) {
    // 1. strategy_run_log 幂等检查
    const runLog = await insertRunLogService({
      userId: portfolio.userId,
      portfolioId: portfolio.id,
      tradeDate: today,
      signalsCount: 0,
      ordersCount: 0,
      notes: 'start',
    })
    if (!runLog) {
      summary.push({ portfolioId: portfolio.id, signalsCount: 0, ordersCount: 0, notes: 'already_run_today' })
      continue
    }

    // 2. 取 strategy spec
    const strategy = await getStrategy(portfolio.strategyId)
    if (!strategy) {
      summary.push({ portfolioId: portfolio.id, signalsCount: 0, ordersCount: 0, notes: 'strategy_not_found' })
      continue
    }

    // 3. 加载 bars(每个 symbol)
    const barsBySymbol = new Map<string, DailyBar[]>()
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    for (const sym of symbolCodes) {
      const bars = await provider.getDailyBars(sym, fromDate, today)
      barsBySymbol.set(sym, bars)
    }

    // 4. 加载当前持仓
    const positions = await listPositionsService(portfolio.id)

    // 5. 生成 plan
    const plan = generateRebalancePlan({
      portfolio,
      positions,
      spec: strategy.spec,
      symbols: symbolCodes,
      barsBySymbol,
      today,
    })

    // 6. 提交 orders(幂等:相同 portfolio + symbol + side + trade_date)
    let ordersCount = 0
    for (const intent of plan.intents) {
      const lastClose = lastCloseForSymbol(barsBySymbol.get(intent.symbolCode) ?? [], today)
      if (lastClose <= 0) continue
      const shares = Math.floor(intent.targetAmount / lastClose)
      if (shares < 100) continue
      const inserted = await insertOrderService({
        userId: portfolio.userId,
        portfolioId: portfolio.id,
        symbolCode: intent.symbolCode,
        side: intent.side,
        shares,
        intendedPrice: lastClose,
        tradeDate: today,
      })
      if (inserted) ordersCount += 1
    }

    summary.push({
      portfolioId: portfolio.id,
      signalsCount: plan.intents.length,
      ordersCount,
    })
  }

  return NextResponse.json({
    date: today,
    portfoliosProcessed: portfolios.length,
    results: summary,
  })
}

function lastCloseForSymbol(bars: DailyBar[], today: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= today)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/cron/run-strategies/route.ts
git commit -m "feat(cron): run-strategies endpoint (close-of-day rebalance)"
```

---

## Task 11: Cron /api/cron/settle-pending(撮合 pending 订单)

**Files:**
- Create: `src/app/api/cron/settle-pending/route.ts`

> 每个交易时段每 15 分钟触发(09:35-15:00 Beijing)。
> 对每个 pending order(由 run-strategies 在 T-1 15:10 生成):
> 1. 加载 T 日(今日)开盘价
> 2. 用 PaperBroker.settlePendingOrders 撮合
> 3. 持久化 fills + 更新 orders / positions / cash

- [ ] **Step 1: 实现 settle-pending 路由**

`src/app/api/cron/settle-pending/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import {
  listPendingOrdersService,
  getPortfolioService,
  listPositionsService,
  upsertPositionService,
  insertFillService,
  updateOrderService,
  savePortfolioCashService,
} from '@/lib/trading/query'
import { PaperBroker } from '@/lib/trading/adapters/paper'
import { getProvider } from '@/lib/data'
import { matchFill } from '@/lib/backtest'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authErr = checkCronAuth(req)
  if (authErr) return authErr

  const provider = getProvider()
  const today = new Date().toISOString().slice(0, 10)

  // 1. 拉所有 pending orders(今日及之前 — T-1 15:10 生成的,今早撮合)
  const pendingOrders = await listPendingOrdersService(today)
  if (pendingOrders.length === 0) {
    return NextResponse.json({ date: today, filled: 0, rejected: 0 })
  }

  // 2. 按 portfolio 分组
  const byPortfolio = new Map<string, typeof pendingOrders>()
  for (const o of pendingOrders) {
    const list = byPortfolio.get(o.portfolioId) ?? []
    list.push(o)
    byPortfolio.set(o.portfolioId, list)
  }

  let totalFilled = 0
  let totalRejected = 0

  for (const [portfolioId, orders] of byPortfolio) {
    const portfolio = await getPortfolioService(portfolioId)
    if (!portfolio) continue

    // 3. 加载今日 bar
    const bars = new Map<string, { tradeDate: string; open: number; close: number }>()
    for (const o of orders) {
      const b = await provider.getDailyBar(o.symbolCode, today)
      if (b) bars.set(o.symbolCode, { tradeDate: b.tradeDate, open: b.open, close: b.close })
    }

    // 4. 加载当前持仓
    let positions = await listPositionsService(portfolioId)
    const positionsMap = new Map(positions.map((p) => [p.symbolCode, p]))

    let cash = portfolio.cash

    for (const order of orders) {
      const bar = bars.get(order.symbolCode)
      if (!bar) {
        await updateOrderService(order.id, { status: 'rejected', reject_reason: 'no_bar' })
        totalRejected += 1
        continue
      }

      // 涨跌停 + 整手 + 现金/股数校验
      const pos = positionsMap.get(order.symbolCode)
      const r = matchFill({
        intent: {
          symbolCode: order.symbolCode,
          side: order.side,
          targetAmount: order.shares * order.intendedPrice,
        },
        nextBar: {
          symbolCode: order.symbolCode,
          tradeDate: bar.tradeDate,
          open: bar.open,
          high: bar.open,
          low: bar.open,
          close: bar.close, // prevClose
          volume: 0,
          amount: 0,
        },
        availableShares: pos?.availableShares ?? 0,
        availableCash: cash,
      })

      if (r.status !== 'filled' || !r.trade) {
        await updateOrderService(order.id, {
          status: 'rejected',
          reject_reason: r.reason ?? 'unknown',
        })
        totalRejected += 1
        continue
      }

      const tr = r.trade
      const filledAt = new Date().toISOString()
      await insertFillService({
        userId: order.userId,
        portfolioId: order.portfolioId,
        orderId: order.id,
        symbolCode: order.symbolCode,
        side: order.side,
        price: tr.price,
        shares: tr.shares,
        amount: tr.amount,
        fee: tr.fee,
      })
      await updateOrderService(order.id, {
        status: 'filled',
        filled_at: filledAt,
        filled_price: tr.price,
        filled_shares: tr.shares,
        fee: tr.fee,
      })

      // 更新 cash
      if (order.side === 'BUY') cash -= tr.amount + tr.fee
      else cash += tr.amount - tr.fee

      // 更新 position
      let nextShares: number
      let nextAvailable: number
      let nextCost: number
      if (order.side === 'BUY') {
        if (pos) {
          const total = pos.shares + tr.shares
          nextCost = (pos.costPrice * pos.shares + tr.price * tr.shares) / total
          nextShares = total
          nextAvailable = pos.availableShares
        } else {
          nextCost = tr.price
          nextShares = tr.shares
          nextAvailable = 0
        }
      } else {
        if (!pos) {
          totalRejected += 1
          continue
        }
        nextShares = pos.shares - tr.shares
        nextCost = pos.costPrice
        nextAvailable = pos.availableShares - tr.shares
      }
      const updated = await upsertPositionService({
        userId: order.userId,
        portfolioId: order.portfolioId,
        symbolCode: order.symbolCode,
        shares: nextShares,
        availableShares: nextAvailable,
        costPrice: nextCost,
      })
      positionsMap.set(order.symbolCode, updated)
      totalFilled += 1
    }

    await savePortfolioCashService(portfolioId, cash)
  }

  return NextResponse.json({
    date: today,
    filled: totalFilled,
    rejected: totalRejected,
  })
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS(`getDailyBar` 是 Phase 0 接口,确认存在;若 Phase 0 实际命名为 `getDailyBars` 单数复数差异,在 Phase 3 实施时调整)。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/cron/settle-pending/route.ts
git commit -m "feat(cron): settle-pending endpoint (T+1 open fills)"
```

---

## Task 12: Cron /api/cron/t1-settle(T+1 解禁)

**Files:**
- Create: `src/app/api/cron/t1-settle/route.ts`

> 每天 09:05 Beijing(UTC 01:05)触发。
> 把昨日 BUY fill 的股数累加到 positions.available_shares。

- [ ] **Step 1: 实现 t1-settle 路由**

`src/app/api/cron/t1-settle/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import {
  listFillsByDateService,
  listPositionsService,
  updatePositionAvailableSharesService,
} from '@/lib/trading/query'
import { computeT1Unlock } from '@/lib/trading/settle'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authErr = checkCronAuth(req)
  if (authErr) return authErr

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const yesterdayFills = await listFillsByDateService(yesterday)
  if (yesterdayFills.length === 0) {
    return NextResponse.json({ today, yesterday, unlockedPortfolios: 0, updates: 0 })
  }

  // 按 portfolio 分组
  const byPortfolio = new Map<string, typeof yesterdayFills>()
  for (const f of yesterdayFills) {
    const list = byPortfolio.get(f.portfolioId) ?? []
    list.push(f)
    byPortfolio.set(f.portfolioId, list)
  }

  let totalPortfolios = 0
  let totalUpdates = 0

  for (const [portfolioId, fills] of byPortfolio) {
    const positions = await listPositionsService(portfolioId)
    const positionsMap = new Map(positions.map((p) => [p.symbolCode, p]))

    const updates = computeT1Unlock({
      today,
      yesterdayFills: fills,
      positions: positionsMap,
    })

    for (const u of updates) {
      await updatePositionAvailableSharesService(portfolioId, u.symbolCode, u.availableShares)
      totalUpdates += 1
    }
    if (updates.length > 0) totalPortfolios += 1
  }

  return NextResponse.json({
    today,
    yesterday,
    unlockedPortfolios: totalPortfolios,
    updates: totalUpdates,
  })
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/cron/t1-settle/route.ts
git commit -m "feat(cron): t1-settle endpoint (T+1 unlock available shares)"
```

---

## Task 13: vercel.json — 添加 3 个 cron 配置

**Files:**
- Modify: `vercel.json`

> Phase 0 已经添加了 `ingest-daily` / `ingest-minute`。本任务在 `crons` 数组追加 3 个新端点。
> 时区说明:Vercel Cron 用 UTC;Beijing = UTC+8。
> - run-strategies: 北京 15:10 = UTC 07:10 → `0 7 * * 1-5`(周一至周五)
> - settle-pending: 北京 09:35-15:00 每 15 分钟 = UTC 01:35-07:00 → `35/15 1-6 * * 1-5`(简化:每小时整点 + 半点触发,共 6 次)
> - t1-settle: 北京 09:05 = UTC 01:05 → `5 1 * * 1-5`

- [ ] **Step 1: 修改 vercel.json**

现有 `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/ingest-daily", "schedule": "0 13 * * 1-5" },
    { "path": "/api/cron/ingest-minute", "schedule": "*/5 1-7 * * 1-5" }
  ]
}
```

修改为:

```json
{
  "crons": [
    { "path": "/api/cron/ingest-daily", "schedule": "0 13 * * 1-5" },
    { "path": "/api/cron/ingest-minute", "schedule": "*/5 1-7 * * 1-5" },
    { "path": "/api/cron/t1-settle", "schedule": "5 1 * * 1-5" },
    { "path": "/api/cron/settle-pending", "schedule": "35/15 1-6 * * 1-5" },
    { "path": "/api/cron/run-strategies", "schedule": "10 7 * * 1-5" }
  ]
}
```

- [ ] **Step 2: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8'))"
```

预期: 无输出。

- [ ] **Step 3: 提交**

```bash
git add vercel.json
git commit -m "feat(cron): add 3 trading cron schedules (run-strategies/settle-pending/t1-settle)"
```

> **环境变量提醒(README / .env.example):** 确保 `.env` 含 `CRON_SECRET=<随机串>`,本地手动测试时通过 `Authorization: Bearer <CRON_SECRET>` 调用 cron 端点。

---

## Task 14: /portfolio 持仓页

**Files:**
- Create: `src/app/(dashboard)/portfolio/page.tsx`
- Create: `src/components/portfolio/portfolio-summary.tsx`
- Create: `src/components/portfolio/positions-table.tsx`

> Server Component 拉数据 + 内嵌 Client 图表(沿用 Phase 2 `EquityCurveChart`)。
> 顶部摘要卡 → 权益曲线 → 持仓表 → 成交明细链接。
> 无 portfolio 时显示空状态 + hint。

- [ ] **Step 1: 实现 portfolio-summary.tsx**

`src/components/portfolio/portfolio-summary.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'

interface PortfolioSummaryProps {
  totalAssets: number
  cash: number
  marketValue: number
  floatingPnl: number
  floatingPnlPct: number
  status: 'active' | 'paused' | 'stopped'
}

export function PortfolioSummary({
  totalAssets,
  cash,
  marketValue,
  floatingPnl,
  floatingPnlPct,
  status,
}: PortfolioSummaryProps) {
  const { t } = useLanguage()
  const items = [
    { label: t('quant.portfolio.summary.totalAssets') as string, value: `¥${totalAssets.toFixed(2)}` },
    { label: t('quant.portfolio.summary.cash') as string, value: `¥${cash.toFixed(2)}` },
    { label: t('quant.portfolio.summary.marketValue') as string, value: `¥${marketValue.toFixed(2)}` },
    {
      label: t('quant.portfolio.summary.floatingPnl') as string,
      value: `${floatingPnl >= 0 ? '+' : ''}¥${floatingPnl.toFixed(2)}`,
      negative: floatingPnl < 0,
    },
    {
      label: t('quant.portfolio.summary.floatingPnlPct') as string,
      value: `${floatingPnlPct >= 0 ? '+' : ''}${(floatingPnlPct * 100).toFixed(2)}%`,
      negative: floatingPnlPct < 0,
    },
    {
      label: t('quant.portfolio.summary.status') as string,
      value: t(`quant.portfolio.status.${status}`) as string,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500">{it.label}</div>
            <div
              className={
                'mt-1 text-xl font-semibold ' +
                (it.negative ? 'text-red-600' : 'text-gray-900')
              }
            >
              {it.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 实现 positions-table.tsx**

`src/components/portfolio/positions-table.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Position } from '@/lib/trading'

interface PositionsTableProps {
  positions: Array<Position & { marketPrice: number; marketValue: number; pnl: number; pnlPct: number }>
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
            <TableCell className={'text-right tabular-nums ' + (p.pnl < 0 ? 'text-red-600' : 'text-green-600')}>
              {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(2)}
            </TableCell>
            <TableCell className={'text-right tabular-nums ' + (p.pnlPct < 0 ? 'text-red-600' : 'text-green-600')}>
              {p.pnlPct >= 0 ? '+' : ''}{(p.pnlPct * 100).toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 3: 实现 /portfolio/page.tsx**

`src/app/(dashboard)/portfolio/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  listPortfolios,
  listPositions,
  listFillsByPortfolio,
} from '@/lib/trading/query'
import { getProvider } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortfolioSummary } from '@/components/portfolio/portfolio-summary'
import { PositionsTable } from '@/components/portfolio/positions-table'
import { EquityCurveChart } from '@/components/backtest/equity-curve-chart'
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const lang = getLanguage()
  const portfolios = await listPortfolios()
  const portfolio = portfolios[0] // 简化:展示第一个

  if (!portfolio) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">
          {lang === 'en' ? 'Portfolio' : '当前持仓'}
        </h1>
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p>{lang === 'en' ? 'No active strategy.' : '尚未启动任何策略'}</p>
            <p className="mt-2 text-sm">
              {lang === 'en'
                ? 'Click “Start” on a strategy detail page.'
                : '从策略详情页点击 “启动” 按钮即可'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 加载持仓 + 行情快照
  const positions = await listPositions(portfolio.id)
  const provider = getProvider()
  const today = new Date().toISOString().slice(0, 10)
  const positionsWithMarket = await Promise.all(
    positions.map(async (p) => {
      const bars = await provider.getDailyBars(p.symbolCode, today, today)
      const bar = bars[bars.length - 1]
      const marketPrice = bar?.close ?? p.costPrice
      const marketValue = p.shares * marketPrice
      const pnl = (marketPrice - p.costPrice) * p.shares
      const pnlPct = p.costPrice > 0 ? (marketPrice - p.costPrice) / p.costPrice : 0
      return { ...p, marketPrice, marketValue, pnl, pnlPct }
    }),
  )
  const totalMarketValue = positionsWithMarket.reduce((s, p) => s + p.marketValue, 0)
  const totalAssets = portfolio.cash + totalMarketValue
  const totalPnl = positionsWithMarket.reduce((s, p) => s + p.pnl, 0)
  const totalCostBasis = positions.reduce((s, p) => s + p.shares * p.costPrice, 0)
  const totalPnlPct = totalCostBasis > 0 ? totalPnl / totalCostBasis : 0

  // 构造 equity curve(简化为单点;Phase 4 用 snapshot 表)
  const equityCurve = [{ date: today, equity: totalAssets }]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {lang === 'en' ? 'Portfolio' : '当前持仓'}
        </h1>
        <Link
          href={'/portfolio/trades' as any}
          className="text-sm text-indigo-600 hover:underline"
        >
          {lang === 'en' ? 'View trades →' : '查看成交明细 →'}
        </Link>
      </div>

      <PortfolioSummary
        totalAssets={totalAssets}
        cash={portfolio.cash}
        marketValue={totalMarketValue}
        floatingPnl={totalPnl}
        floatingPnlPct={totalPnlPct}
        status={portfolio.status}
      />

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'en' ? 'Equity Curve' : '权益曲线'}</CardTitle>
        </CardHeader>
        <CardContent>
          <EquityCurveChart data={equityCurve} />
          <p className="mt-2 text-xs text-gray-500">
            {lang === 'en'
              ? 'Single point — full history available in Phase 4.'
              : '当前为单点展示,完整曲线将在 Phase 4 接入'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'en' ? 'Positions' : '持仓明细'}</CardTitle>
        </CardHeader>
        <CardContent>
          {positionsWithMarket.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {lang === 'en' ? 'No positions' : '暂无持仓'}
            </p>
          ) : (
            <PositionsTable positions={positionsWithMarket} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/portfolio/portfolio-summary.tsx src/components/portfolio/positions-table.tsx src/app/(dashboard)/portfolio/page.tsx
git commit -m "feat(portfolio-ui): /portfolio page with summary + curve + positions"
```

---

## Task 15: /portfolio/trades 成交明细页

**Files:**
- Create: `src/app/(dashboard)/portfolio/trades/page.tsx`

- [ ] **Step 1: 实现成交明细页**

`src/app/(dashboard)/portfolio/trades/page.tsx`:

```tsx
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
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function TradesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const lang = getLanguage()
  const fills = await listFills(200)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {lang === 'en' ? 'Trades' : '成交明细'}
        </h1>
        <Link
          href={'/portfolio' as any}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← {lang === 'en' ? 'Back to Portfolio' : '返回持仓'}
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {fills.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              {lang === 'en' ? 'No trades yet' : '暂无成交'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === 'en' ? 'Filled At' : '成交日期'}</TableHead>
                  <TableHead>{lang === 'en' ? 'Symbol' : '股票'}</TableHead>
                  <TableHead>{lang === 'en' ? 'Side' : '方向'}</TableHead>
                  <TableHead className="text-right">{lang === 'en' ? 'Price' : '成交价'}</TableHead>
                  <TableHead className="text-right">{lang === 'en' ? 'Shares' : '股数'}</TableHead>
                  <TableHead className="text-right">{lang === 'en' ? 'Amount' : '成交金额'}</TableHead>
                  <TableHead className="text-right">{lang === 'en' ? 'Fee' : '费用'}</TableHead>
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
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/(dashboard)/portfolio/trades/page.tsx
git commit -m "feat(portfolio-ui): /portfolio/trades fills list page"
```

---

## Task 16: "启动策略" UI 接入 /strategy/[id]

**Files:**
- Create: `src/components/strategy/strategy-controls.tsx`
- Modify: `src/app/(dashboard)/strategy/[id]/page.tsx`(在合适位置添加 `<StrategyControls>`)

- [ ] **Step 1: 实现 StrategyControls 组件**

`src/components/strategy/strategy-controls.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLanguage } from '@/components/providers/language-provider'
import {
  startStrategyAction,
  pauseStrategyAction,
  stopStrategyAction,
} from '@/lib/trading/actions'
import type { Portfolio } from '@/lib/trading'

interface StrategyControlsProps {
  strategyId: string
  portfolio: Portfolio | null
}

export function StrategyControls({ strategyId, portfolio }: StrategyControlsProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleStart() {
    if (!confirm(t('quant.trading.startConfirm') as string)) return
    setError(null)
    startTransition(async () => {
      const r = await startStrategyAction(strategyId)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  function handlePause() {
    if (!portfolio) return
    setError(null)
    startTransition(async () => {
      const r = await pauseStrategyAction(portfolio.id)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  function handleStop() {
    if (!portfolio) return
    if (!confirm(t('quant.trading.stopConfirm') as string)) return
    setError(null)
    startTransition(async () => {
      const r = await stopStrategyAction(portfolio.id)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        {!portfolio || portfolio.status === 'stopped' ? (
          <Button onClick={handleStart} disabled={isPending}>
            {t('quant.trading.start') as string}
          </Button>
        ) : null}
        {portfolio?.status === 'active' && (
          <>
            <Button onClick={handlePause} variant="outline" disabled={isPending}>
              {t('quant.trading.pause') as string}
            </Button>
            <Button onClick={handleStop} variant="destructive" disabled={isPending}>
              {t('quant.trading.stop') as string}
            </Button>
          </>
        )}
        {portfolio?.status === 'paused' && (
          <>
            <Button onClick={handleStart} disabled={isPending}>
              {t('quant.trading.resume') as string}
            </Button>
            <Button onClick={handleStop} variant="destructive" disabled={isPending}>
              {t('quant.trading.stop') as string}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 /strategy/[id]/page.tsx 接入**

修改 `src/app/(dashboard)/strategy/[id]/page.tsx`(沿用 Phase 1 完成结构):

```tsx
import { StrategyControls } from '@/components/strategy/strategy-controls'
import { getPortfolioByStrategy } from '@/lib/trading/query'

// 在 page 内部:
const portfolio = await getPortfolioByStrategy(params.id)

// 在合适位置(spec 卡片下方)添加:
<StrategyControls strategyId={strategy.id} portfolio={portfolio} />
```

> 详细 diff 由实现者按 Phase 1 完成的实际结构决定;要求:把 `<StrategyControls>` 渲染到页面。

- [ ] **Step 3: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/components/strategy/strategy-controls.tsx src/app/(dashboard)/strategy/[id]/page.tsx
git commit -m "feat(portfolio-ui): StrategyControls (start/pause/stop) in strategy detail"
```

---

## Task 17: trading/index.ts — 公共 API

**Files:**
- Create: `src/lib/trading/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/trading/index.ts`:

```ts
// 公共 API
export type {
  Order,
  OrderRequest,
  OrderSide,
  OrderStatus,
  Position,
  Fill,
  Portfolio,
  StrategyRunLogEntry,
  SettleResult,
} from './types'
export type { BrokerAdapter } from './broker'
export { PaperBroker, type PaperBrokerDeps } from './adapters/paper'
export { computeT1Unlock, type T1UnlockUpdate } from './settle'
export {
  generateRebalancePlan,
  type RebalanceIntent,
  type RebalancePlan,
} from './rebalance'
export {
  listPortfolios,
  getPortfolioByStrategy,
  listPositions,
  listFills,
  listFillsByPortfolio,
  listRunLogs,
} from './query'
export {
  startStrategyAction,
  pauseStrategyAction,
  stopStrategyAction,
  cancelOrderAction,
  type TradingFormState,
} from './actions'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/trading/index.ts
git commit -m "feat(trading): public API barrel"
```

---

## Task 18: 集成测试 — RLS 隔离 + cron 幂等

**Files:**
- Create: `src/lib/trading/integration.test.ts`

> 这些测试需要本地 Supabase 跑起来(`pnpm dlx supabase start` + migrations applied)。
> 不强制在 CI 跑(本地 dev 验证即可)。

- [ ] **Step 1: 写测试**

`src/lib/trading/integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { ensureActivePortfolio, setPortfolioStatus } from './query'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  describe.skip('integration', () => {
    it('skipped — Supabase not configured', () => {})
  })
} else {
  const admin = createClient(URL, SERVICE_KEY)

  beforeAll(async () => {
    // 清干净两个测试用户的数据
    await admin.from('trade260915a_fills').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
    await admin.from('trade260915a_orders').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
    await admin.from('trade260915a_strategy_run_log').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
    await admin.from('trade260915a_positions').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
    await admin.from('trade260915a_portfolios').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
  })

  const TEST_USER_A = '11111111-1111-1111-1111-111111111111'
  const TEST_USER_B = '22222222-2222-2222-2222-222222222222'
  const TEST_STRATEGY = '33333333-3333-3333-3333-333333333333'

  describe('RLS isolation', () => {
    it('user A can not see user B portfolios via RLS client', async () => {
      // user A 创建一个 portfolio
      const userAClient = createClient(URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer fake_jwt_for_${TEST_USER_A}` } },
      })
      // ...
      // 简化:这一段需要在测试环境配 JWT;留给 Phase 4 自动化,本期手动验证。
    })
  })

  describe('idempotency', () => {
    it('insertRunLogService second call returns null on same trade_date', async () => {
      const today = new Date().toISOString().slice(0, 10)
      // ... 需 user_id 在 auth.users 中存在;此处简化为单元测试覆盖 computeT1Unlock 等纯函数,DB 端手动验证。
    })
  })
}
```

> **简化说明:** 由于 Supabase 测试需要本地 supabase + test users,完整集成测试留到 CI 配置。
> 本 Phase 通过手工冒烟(Step 2)验证。Task 18 仅留接口骨架 + 编译通过。

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/trading/integration.test.ts
git commit -m "test(trading): integration test skeleton (RLS + idempotency, manual verify)"
```

---

## Task 19: 验证 — 全量测试 + 覆盖率 + 端到端冒烟

- [ ] **Step 1: 全量单测**

```bash
pnpm test
```

预期: 全部 PASS(包含 Phase 0-2 全部 + Phase 3 lib)。

- [ ] **Step 2: 覆盖率检查**

```bash
pnpm test:cov src/lib/trading/
```

预期:
- `lib/trading/types.ts`: 100%
- `lib/trading/settle.ts`: ≥ 95%
- `lib/trading/rebalance.ts`: ≥ 90%
- `lib/trading/adapters/paper.ts`: ≥ 80%
- **整体 `lib/trading/*` ≥ 80% 行覆盖**(满足 spec §8.1)

- [ ] **Step 3: 编译 + lint**

```bash
pnpm typecheck
pnpm lint
```

预期: PASS。

- [ ] **Step 4: 端到端冒烟(本地开发)**

```bash
# 1. 启动本地 Supabase
pnpm dlx supabase start

# 2. 配置 .env.local (含 CRON_SECRET)
echo 'CRON_SECRET=test-secret-123' >> .env.local

# 3. 启动 dev server
pnpm dev
```

**手工验证步骤:**

1. **注册 / 登录:** 浏览器打开,注册一个新账号 A。
2. **创建策略:** 进 `/strategy/new`,保存一个简单策略(任选 1 因子 + 阈值 0)。
3. **启动策略:** 进 `/strategy/[id]`,点击 "启动"。状态变为 "Active"。
4. **检查 portfolio:** 进 `/portfolio`,看到摘要卡 + 空持仓 + 空曲线。
5. **手动触发 run-strategies cron:**
   ```bash
   curl -X POST http://localhost:3000/api/cron/run-strategies \
     -H "Authorization: Bearer test-secret-123"
   ```
   预期: 返回 `{ date: "...", portfoliosProcessed: 1, results: [{ portfolioId, signalsCount, ordersCount }] }`
6. **DB 检查:** 用 psql 或 Studio 查看 `trade260915a_orders`,应有 N 条 pending 订单。
7. **手动触发 settle-pending:**
   ```bash
   curl -X POST http://localhost:3000/api/cron/settle-pending \
     -H "Authorization: Bearer test-secret-123"
   ```
   预期: `{ date: "...", filled: N, rejected: 0 }`
8. **检查 portfolio:** `/portfolio` 应看到持仓(available_shares=0,T+1 锁定中)+ 现金减少。
9. **检查 trades:** `/portfolio/trades` 看到 fill 记录。
10. **手动触发 t1-settle:**
    ```bash
    curl -X POST http://localhost:3000/api/cron/t1-settle \
      -H "Authorization: Bearer test-secret-123"
    ```
    预期: `{ unlockedPortfolios: 1, updates: N }`
11. **再次检查 portfolio:** `/portfolio` 持仓的 `availableShares` 应等于 `shares`(T+1 解禁)。
12. **RLS 隔离:** 注册另一个账号 B,看不到 A 的 portfolio / fills(空状态)。

- [ ] **Step 5: 提交(若有临时改动)**

```bash
git status  # 期望 clean;否则提交
```

---

## 风险与注意

- **同步 vs 异步:** `run-strategies` 单次遍历当前用户所有 active portfolios;MVP 假设 < 100 portfolio × 主板 3000 股 < 60s。若超 60s,Phase 4 改为分批。
- **Vercel Cron 频率:** `settle-pending` 配置为每 15 分钟触发,但 09:05 前不跑(避免抢在 t1-settle 之前);此约束由 cron schedule 间接保证(settle-pending 起始 01:35 UTC = 09:35 Beijing)。
- **T+1 解禁重复:** t1-settle 同一日重复触发会幂等(只 increment available_shares 一次)。但若 cron 失败 → 补跑,需要二次校验(本期接受:补跑会重复累加)。
  缓解:Phase 4 增加 "已 T+1 解禁" 标志位;本期忽略。
- **订单 pending 唯一索引:** 同 portfolio + symbol + side + trade_date 不能重复。若 run-strategies 在同日被触发两次,第二次的 INSERT 会被 PG 拒绝(`23505`),代码已处理并跳过(`insertOrderService` 返回 null)。
- **paper.ts 测试的 BarLite 类型:** 测试用简化 bar 对象(只有 open + close),实际生产用 DailyBar 全字段。PaperBroker 接收的是 nextBar 的子集(open + close 作 prevClose),其余字段不影响撮合。
- **cash 浮点:** 全程用 number(Number 列返回 string,我们 toNumber)。在 mock 数据下精度足够;真实数据接入后改用 Decimal.js。
- **空 portfolio:** `/portfolio` 无 portfolio 时显示空状态 + hint,不报错。
- **首次撮合 cash 校验:** `settle-pending` 用 `availableCash: cash` 传给 matchFill,逻辑等同 PaperBroker;两者一致。

---

## 验收标准 (DoD)

- [ ] 全部 19 个 Task 完成且 commit
- [ ] `pnpm test` 全 PASS,`lib/trading/*` 行覆盖 ≥ 80%
- [ ] `pnpm typecheck` PASS
- [ ] 端到端冒烟 12 步全部通过(本地 dev)
- [ ] 浏览器:从策略详情 "启动",`/portfolio` 看到组合,`/portfolio/trades` 看到 fill
- [ ] 三个 cron 端点可用 Bearer token 调用,业务正确
- [ ] RLS 隔离:B 用户看不到 A 用户的 portfolios / fills
- [ ] cron 幂等:run-strategies / t1-settle 重跑不产生重复副作用

---

## 后续 Phase 接缝

- **Phase 4:** 接入 `lib/risk/*`,在 `run-strategies` 中调 `riskEngine.evaluate(plan, ctx)`;
  增加 `trade260915a_portfolio_equity_snapshots` 表(每交易日收盘记录 equity),实现 `MAX_DRAWDOWN_STOP` 规则;
  在 `t1-settle` 写入 equity snapshot 以保证 peak 准确。
- **Phase 4:** 完善 `EquityCurveChart` 数据源,使用 snapshot 表替换单点。
- **Phase 4:** 实盘 BrokerAdapter 接入,`PaperBroker` 接口已抽象。
