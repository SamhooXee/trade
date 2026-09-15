# Quant Trading Phase 2 — 回测引擎 + 回测 UI — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现回测引擎(`fills` 撮合 + `metrics` 5 指标 + `engine` 主循环)与基于 `lightweight-charts` 的可视化,完成 `/backtest` 列表与 `/backtest/[id]` 报告页,让用户能从策略详情页一键运行回测并查看完整指标报告与权益曲线。

**Architecture:** 回测引擎是**纯函数** (`runBacktest(input) => output`),不读 DB、不调 risk 引擎(回测不实装风控,只算指标),可独立单测;数据从 `lib/data` 拉,信号用 `lib/strategy/evaluate` 算,撮合走 `lib/backtest/fills`(涨跌停 / 整手 / 费率),指标走 `lib/backtest/metrics`。Server Action 同步执行回测(单次回测 < 5s,留接缝给 Phase 4 异步化),结果存 JSONB 到 `trade260915a_backtest_runs.result`。UI 用 `lightweight-charts` 渲染权益曲线与 K 线。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · `lightweight-charts` 4.x (Phase 0 已引入) · shadcn/ui 新增 `Table` 组件 · Supabase Postgres · Vitest

**Spec:** `docs/superpowers/specs/2026-09-15-quant-trading-design.md` (Phase 2 章节 §9)

**依赖前置 (来自 Phase 0 / Phase 1):**
- `src/lib/data` (`MarketDataProvider` / `MockDataProvider` / `getDailyBars` / `listSymbols`)
- `src/lib/scheduler` (`isTradingDay`)
- `src/lib/factors` (6 个因子 + registry)
- `src/lib/strategy` (`StrategySpec` / `composeStrategy` / `evaluateConditions` / `parseStoredSpec` / `StrategyRow` / `getStrategy`)
- `src/components/ui/table.tsx` 不存在,本 Phase 一并加入(shadcn `Table` 组件)
- `src/app/(dashboard)/layout.tsx` + `nav.tsx`(顶部导航含 "回测")
- `src/components/providers/language-provider`
- 主板股票已 `pnpm seed:symbols` 导入

---

## 全局约定

- **表名前缀:** 所有新表使用 `trade260915a_` 前缀。
- **新表:** `trade260915a_backtest_runs`。
- **i18n namespace:** 复用 `quant.backtest.*` 与 `quant.metrics.*`。
- **Git 节奏:** 每个 Task 末尾独立提交。
- **TDD:** 每个 lib/ 任务先写失败测试,再写实现。
- **路径别名:** 沿用 `@/lib/...` `@/components/...` `@/app/...`。
- **数字精度:**
  - 价格 / 阈值 / 收益率:`number` (内部);DB 存 `NUMERIC(12,4)` / `NUMERIC(14,2)`。
  - 比率(总收益 / 最大回撤 / 胜率)统一存为小数 (`0.123` 表 +12.3%)。
- **撮合约定(沿用 spec §6.4 / §6.5):**
  - **T 日收盘调仓 → T+1 开盘价成交**(撮合看下一交易日 bar)。
  - **整手 = 100 股**,股数向下取整。
  - **涨跌停 ±10%**(主板统一);涨停 BUY 拒单,跌停 SELL 拒单。
  - **费率(简化版 A 股):**
    - 佣金: `max(5, 0.025% × amount)`,单边。
    - 印花税: SELL 收 `0.1% × amount`。
    - 过户费: 本期忽略(归入 0 误差)。
- **回测不调 risk 引擎**(`MAX_DRAWDOWN_STOP` 等风控规则在 Phase 4 接入 `cron/run-strategies`);回测只是"模拟",用户最终在 UI 看到 `MAX_DRAWDOWN_STOP` 是怎么作用的(走的是 `metrics.maxDrawdown` 字段)。
- **覆盖率门槛** (沿用 spec §8.1):`lib/backtest/*` 行覆盖 ≥ 90%。

---

## Task 1: shadcn `Table` 组件 + `backtest_runs` migration

**Files:**
- Create: `src/components/ui/table.tsx`
- Create: `supabase/migrations/004_backtest_runs.sql`

- [ ] **Step 1: 创建 Table 组件**

`src/components/ui/table.tsx`(沿用 shadcn 模板):

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  ),
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
)
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b transition-colors hover:bg-gray-50 data-[state=selected]:bg-gray-100',
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-2 text-left align-middle font-medium text-gray-500 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  ),
)
TableCell.displayName = 'TableCell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
```

- [ ] **Step 2: 创建 backtest_runs migration**

`supabase/migrations/004_backtest_runs.sql`:

```sql
-- 004_backtest_runs.sql
-- 回测运行记录。每次用户对某个策略跑一次回测就一行。

CREATE TABLE trade260915a_backtest_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id   UUID NOT NULL REFERENCES trade260915a_strategies(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  initial_cash  NUMERIC(14, 2) NOT NULL CHECK (initial_cash > 0),
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  result        JSONB,
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX trade260915a_backtest_runs_user_id_idx
  ON trade260915a_backtest_runs(user_id);
CREATE INDEX trade260915a_backtest_runs_strategy_id_idx
  ON trade260915a_backtest_runs(strategy_id);
CREATE INDEX trade260915a_backtest_runs_user_started_idx
  ON trade260915a_backtest_runs(user_id, started_at DESC);

-- ============ RLS ============
ALTER TABLE trade260915a_backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own backtest runs"
  ON trade260915a_backtest_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 3: 应用 migration 到本地 Supabase**

```bash
pnpm dlx supabase db reset
```

预期: 全部 migration 成功,无错误。

- [ ] **Step 4: 验证表与 RLS**

```bash
pnpm dlx supabase db psql --local -c "\d trade260915a_backtest_runs"
pnpm dlx supabase db psql --local -c "
  SET ROLE authenticated;
  INSERT INTO trade260915a_backtest_runs
    (user_id, strategy_id, start_date, end_date, initial_cash)
  VALUES ('00000000-0000-0000-0000-000000000000',
          '00000000-0000-0000-0000-000000000001',
          '2026-01-01', '2026-12-31', 1000000);
"
```

预期: 第一个命令显示表结构(含 3 个 CHECK 约束);第二个报 RLS 错误 (`new row violates row-level security policy`)。

- [ ] **Step 5: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/ui/table.tsx supabase/migrations/004_backtest_runs.sql
git commit -m "feat(backtest): shadcn Table component + backtest_runs table with RLS"
```

---

## Task 2: types.ts — BacktestInput / Output / Trade / EquityPoint

**Files:**
- Create: `src/lib/backtest/types.ts`

> 先定义所有跨 Task 共享的类型。后续 Task 3-5 严格按本文件签名实现。

- [ ] **Step 1: 创建 types.ts**

`src/lib/backtest/types.ts`:

```ts
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

/** 回测输入 */
export interface BacktestInput {
  /** 待回测的策略 spec(已 compose 过的完整 spec) */
  spec: StrategySpec
  /** 回测起始交易日(包含) */
  startDate: string  // 'YYYY-MM-DD'
  /** 回测结束交易日(包含) */
  endDate: string
  /** 初始资金(元) */
  initialCash: number
  /** 候选股票池;不传则全主板 */
  symbols?: string[]
  /** 撮合费率(可选覆盖,默认 A 股简化版) */
  fees?: FeeConfig
}

/** 费率配置 */
export interface FeeConfig {
  /** 佣金率,默认 0.00025 */
  commissionRate?: number
  /** 佣金最低,默认 5 元 */
  commissionMin?: number
  /** 印花税率(SELL),默认 0.001 */
  stampTaxRate?: number
}

/** 单笔成交(回测产出) */
export interface Trade {
  /** 成交日期(实际撮合日 = 调仓日 + 1 交易日) */
  date: string
  symbolCode: string
  side: 'BUY' | 'SELL'
  /** 成交价格 */
  price: number
  /** 成交股数(已整手化) */
  shares: number
  /** 成交金额 = price × shares */
  amount: number
  /** 总费用(佣金 + 印花税) */
  fee: number
}

/** 单日权益点 */
export interface EquityPoint {
  date: string
  /** 当时权益 = 现金 + 持仓市值(以当日收盘价计) */
  equity: number
}

/** 5 个核心指标 */
export interface Metrics {
  totalReturn: number       // 总收益率 (小数, +0.123 = +12.3%)
  annualizedReturn: number  // 年化收益率
  maxDrawdown: number       // 最大回撤 (负数或 0)
  sharpeRatio: number       // 夏普比率 (rf=0)
  winRate: number           // 胜率 (0~1)
  totalTrades: number       // 总交易笔数 (BUY+SELL 合计)
  avgHoldingDays: number    // 平均持仓天数
}

/** 回测输出 */
export interface BacktestOutput {
  initialCash: number
  finalEquity: number
  metrics: Metrics
  trades: Trade[]
  equityCurve: EquityPoint[]
}

/** 单只股票持仓(引擎内部状态) */
export interface Position {
  symbolCode: string
  shares: number       // 当前持仓
  costPrice: number    // 平均成本(简化:仅最近一次 BUY 价;不重复加仓)
  entryDate: string    // 入场日期(用于算持仓天数)
}

/** 单只股票的调仓意图(引擎内部) */
export interface RebalanceIntent {
  symbolCode: string
  side: 'BUY' | 'SELL'
  /** 目标金额(BUY:目标成交金额;SELL:目标卖出金额) */
  targetAmount: number
}

/** 撮合请求(传入 fills.ts) */
export interface FillRequest {
  intent: RebalanceIntent
  /** 下一交易日 bar(用 open 撮合) */
  nextBar: DailyBar
  /** SELL 时:当前可用股数 */
  availableShares?: number
  /** BUY 时:当前可用现金 */
  availableCash?: number
}

/** 撮合结果 */
export interface FillResult {
  status: 'filled' | 'rejected'
  reason?: string
  trade?: Trade
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/backtest/types.ts
git commit -m "feat(backtest): shared types for input/output/trades/metrics"
```

---

## Task 3: fills.ts — matchFills (撮合 + 涨跌停 + 整手 + 费率)

**Files:**
- Create: `src/lib/backtest/fills.ts`
- Create: `src/lib/backtest/fills.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/backtest/fills.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchFill, computeFee, DEFAULT_FEE_CONFIG, LIMIT_PCT } from './fills'
import type { FillRequest } from './types'
import type { DailyBar } from '@/lib/data'

function mkBar(date: string, open: number, prevClose: number, volume = 1_000_000): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open,
    high: Math.max(open, prevClose),
    low: Math.min(open, prevClose),
    close: open,
    volume,
    amount: open * volume,
  }
}

describe('LIMIT_PCT', () => {
  it('is 10% for mainboard', () => {
    expect(LIMIT_PCT).toBe(0.10)
  })
})

describe('computeFee', () => {
  it('BUY commission is max(min, amount × rate)', () => {
    // 1000 股 × 10 元 = 10000,佣金 = max(5, 10000×0.00025) = max(5, 2.5) = 5
    expect(computeFee(10000, 'BUY', DEFAULT_FEE_CONFIG)).toBeCloseTo(5, 2)
    // 10000 股 × 10 元 = 100000,佣金 = 100000 × 0.00025 = 25
    expect(computeFee(100000, 'BUY', DEFAULT_FEE_CONFIG)).toBeCloseTo(25, 2)
  })

  it('SELL adds stamp tax = amount × 0.001', () => {
    // 佣金 25 + 印花税 100 = 125
    expect(computeFee(100000, 'SELL', DEFAULT_FEE_CONFIG)).toBeCloseTo(125, 2)
  })
})

describe('matchFill — BUY', () => {
  it('fills at next bar open when not at limit-up', () => {
    const prevClose = 10
    const nextBar = mkBar('2026-09-16', 10.5, prevClose)
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 10500 },
      nextBar,
      availableCash: 20000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    // 10500 / 10.5 = 1000 股 (整手)
    expect(r.trade?.shares).toBe(1000)
    expect(r.trade?.price).toBe(10.5)
    expect(r.trade?.amount).toBeCloseTo(10500, 2)
  })

  it('rounds shares down to lot of 100', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 2500 }, // 2500/10 = 250 → 200
      nextBar: mkBar('2026-09-16', 10, 10),
      availableCash: 5000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    expect(r.trade?.shares).toBe(200)
    expect(r.trade?.amount).toBeCloseTo(2000, 2)
  })

  it('rejects when open at limit-up (prevClose × 1.10)', () => {
    // prevClose 10 → limit-up 11.00,next bar open = 11
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 11000 },
      nextBar: mkBar('2026-09-16', 11, 10),
      availableCash: 20000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/limit/i)
  })

  it('rejects when intended shares round to 0', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'BUY', targetAmount: 50 }, // 50/10 = 5 股 < 100
      nextBar: mkBar('2026-09-16', 10, 10),
      availableCash: 5000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/lot/i)
  })
})

describe('matchFill — SELL', () => {
  it('fills at next bar open when not at limit-down', () => {
    const prevClose = 10
    const nextBar = mkBar('2026-09-16', 9.5, prevClose)
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 9500 },
      nextBar,
      availableShares: 1000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('filled')
    expect(r.trade?.shares).toBe(1000)
    expect(r.trade?.price).toBe(9.5)
  })

  it('rejects when open at limit-down (prevClose × 0.90)', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 9000 },
      nextBar: mkBar('2026-09-16', 9, 10),
      availableShares: 1000,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
    expect(r.reason).toMatch(/limit/i)
  })

  it('rejects when availableShares < 100', () => {
    const req: FillRequest = {
      intent: { symbolCode: '600000', side: 'SELL', targetAmount: 5000 },
      nextBar: mkBar('2026-09-16', 10, 10),
      availableShares: 50,
    }
    const r = matchFill(req)
    expect(r.status).toBe('rejected')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/backtest/fills.test.ts
```

预期: FAIL — `Cannot find module './fills'`。

- [ ] **Step 3: 实现 fills.ts**

`src/lib/backtest/fills.ts`:

```ts
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
 * prevClose = nextBar 的"前一日收盘"。我们无法直接拿到 prevClose,
 * 故约定: caller 在 nextBar 上以 `close` 字段额外传 prevClose (回测引擎知道),
 * 或者采用 high/low 边界近似。
 *
 * 实现上,接受 nextBar.close 当作 "可用于判涨跌停的参考价",实际上下一个
 * 交易日的 open 与前一日 close 在回测里已知 — 调用方把 prevClose 放在
 * nextBar.close 里(回测引擎写入)。本文件只按字段读取。
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
      return { status: 'rejected', reason: `BUY rejected: shares round to 0 (target=${intent.targetAmount})` }
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
  const targetShares = Math.floor(intent.targetAmount / open)
  const shares = Math.floor(targetShares / LOT_SIZE) * LOT_SIZE
  if (req.availableShares !== undefined) {
    if (req.availableShares < LOT_SIZE) {
      return { status: 'rejected', reason: 'SELL rejected: availableShares < 100' }
    }
    if (shares > req.availableShares) {
      // 不超过可用
      const adj = Math.floor(req.availableShares / LOT_SIZE) * LOT_SIZE
      if (adj <= 0) {
        return { status: 'rejected', reason: 'SELL rejected: insufficient sellable shares' }
      }
      const adjAmount = adj * open
      const adjFee = computeFee(adjAmount, 'SELL', cfg)
      return {
        status: 'filled',
        trade: {
          date: nextBar.tradeDate,
          symbolCode: intent.symbolCode,
          side: 'SELL',
          price: open,
          shares: adj,
          amount: adjAmount,
          fee: adjFee,
        },
      }
    }
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/backtest/fills.test.ts
```

预期: PASS, 12 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/backtest/fills.ts src/lib/backtest/fills.test.ts
git commit -m "feat(backtest): matchFill with limit-up/down guard, lot rounding, fees"
```

---

## Task 4: metrics.ts — computeMetrics

**Files:**
- Create: `src/lib/backtest/metrics.ts`
- Create: `src/lib/backtest/metrics.test.ts`

> 5 个核心指标 + 2 个辅助(总交易 / 平均持仓天数)。算法沿用 spec §8.2 测试用例覆盖。

- [ ] **Step 1: 写失败测试**

`src/lib/backtest/metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'
import type { Trade, EquityPoint } from './types'

function eq(equity: number[]): EquityPoint[] {
  return equity.map((e, i) => ({
    date: `2026-09-${(i + 1).toString().padStart(2, '0')}`,
    equity: e,
  }))
}

describe('computeMetrics — totalReturn', () => {
  it('positive', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 1100000, 1230000]),
      trades: [],
    })
    expect(m.totalReturn).toBeCloseTo(0.23, 4)
  })

  it('negative', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 900000, 800000]),
      trades: [],
    })
    expect(m.totalReturn).toBeCloseTo(-0.20, 4)
  })

  it('flat', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000, 1000000, 1000000]),
      trades: [],
    })
    expect(m.totalReturn).toBe(0)
  })
})

describe('computeMetrics — maxDrawdown', () => {
  it('peak at day 0 valley at day 2 → -25%', () => {
    // [100, 80, 60, 90]  peak=100, valley=60 → -40%
    const m = computeMetrics({
      initialCash: 100,
      equityCurve: eq([100, 80, 60, 90]),
      trades: [],
    })
    expect(m.maxDrawdown).toBeCloseTo(-0.40, 4)
  })

  it('0% for monotonic rise', () => {
    const m = computeMetrics({
      initialCash: 100,
      equityCurve: eq([100, 110, 120, 130]),
      trades: [],
    })
    expect(m.maxDrawdown).toBe(0)
  })
})

describe('computeMetrics — annualizedReturn', () => {
  it('1.5x in 252 trading days ≈ +50% annualized', () => {
    // 1.5 → (1.5)^(252/252) - 1 = 0.5
    const curve = eq(Array.from({ length: 253 }, (_, i) => 1000000 * (1 + 0.5 * (i / 252))))
    const m = computeMetrics({ initialCash: 1000000, equityCurve: curve, trades: [] })
    expect(m.annualizedReturn).toBeCloseTo(0.5, 3)
  })
})

describe('computeMetrics — winRate', () => {
  it('BUY+SELL closed round-trips with profit/loss', () => {
    // 3 笔完整交易:2 盈 1 亏
    const trades: Trade[] = [
      // 第 1 笔盈: 10 买 11 卖
      { date: '2026-09-01', symbolCode: '600000', side: 'BUY', price: 10, shares: 1000, amount: 10000, fee: 5 },
      { date: '2026-09-02', symbolCode: '600000', side: 'SELL', price: 11, shares: 1000, amount: 11000, fee: 15 },
      // 第 2 笔盈: 12 买 13 卖
      { date: '2026-09-03', symbolCode: '600001', side: 'BUY', price: 12, shares: 100, amount: 1200, fee: 5 },
      { date: '2026-09-04', symbolCode: '600001', side: 'SELL', price: 13, shares: 100, amount: 1300, fee: 6.3 },
      // 第 3 笔亏: 20 买 18 卖
      { date: '2026-09-05', symbolCode: '600002', side: 'BUY', price: 20, shares: 100, amount: 2000, fee: 5 },
      { date: '2026-09-06', symbolCode: '600002', side: 'SELL', price: 18, shares: 100, amount: 1800, fee: 6.8 },
    ]
    const m = computeMetrics({ initialCash: 1000000, equityCurve: eq([1000000, 1000000]), trades })
    expect(m.totalTrades).toBe(6)
    expect(m.winRate).toBeCloseTo(2 / 3, 4)
  })

  it('no closed trades → winRate = 0', () => {
    const m = computeMetrics({
      initialCash: 1000000,
      equityCurve: eq([1000000]),
      trades: [],
    })
    expect(m.winRate).toBe(0)
  })
})

describe('computeMetrics — avgHoldingDays', () => {
  it('round-trip BUY→SELL days = 1, 2, 3 → avg = 2', () => {
    const trades: Trade[] = [
      { date: '2026-09-01', symbolCode: '600000', side: 'BUY', price: 10, shares: 1000, amount: 10000, fee: 5 },
      { date: '2026-09-02', symbolCode: '600000', side: 'SELL', price: 11, shares: 1000, amount: 11000, fee: 15 },
      { date: '2026-09-01', symbolCode: '600001', side: 'BUY', price: 12, shares: 100, amount: 1200, fee: 5 },
      { date: '2026-09-04', symbolCode: '600001', side: 'SELL', price: 13, shares: 100, amount: 1300, fee: 6.3 },
      { date: '2026-09-01', symbolCode: '600002', side: 'BUY', price: 20, shares: 100, amount: 2000, fee: 5 },
      { date: '2026-09-04', symbolCode: '600002', side: 'SELL', price: 18, shares: 100, amount: 1800, fee: 6.8 },
    ]
    const m = computeMetrics({ initialCash: 1000000, equityCurve: eq([1000000]), trades })
    expect(m.avgHoldingDays).toBeCloseTo((1 + 3 + 3) / 3, 4)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/backtest/metrics.test.ts
```

预期: FAIL — `Cannot find module './metrics'`。

- [ ] **Step 3: 实现 metrics.ts**

`src/lib/backtest/metrics.ts`:

```ts
import type { EquityPoint, Metrics, Trade } from './types'

interface ComputeMetricsInput {
  initialCash: number
  equityCurve: EquityPoint[]
  trades: Trade[]
}

/** 一年交易日(沿用 spec §3 / A 股惯例) */
const TRADING_DAYS_PER_YEAR = 252

/**
 * 由 equity 序列计算总收益、年化、最大回撤、夏普。
 */
export function computeMetrics(input: ComputeMetricsInput): Metrics {
  const { initialCash, equityCurve, trades } = input

  const finalEquity = equityCurve.length > 0
    ? equityCurve[equityCurve.length - 1].equity
    : initialCash

  const totalReturn = (finalEquity - initialCash) / initialCash
  const tradingDays = Math.max(equityCurve.length - 1, 0)
  const annualizedReturn = tradingDays === 0
    ? 0
    : Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / tradingDays) - 1

  // 最大回撤
  let peak = -Infinity
  let maxDD = 0
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity
    if (peak > 0) {
      const dd = (p.equity - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
  }

  // 夏普(基于日收益率;rf=0)
  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity
    if (prev > 0) {
      dailyReturns.push((equityCurve[i].equity - prev) / prev)
    }
  }
  let sharpeRatio = 0
  if (dailyReturns.length > 1) {
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    const variance =
      dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length
    const std = Math.sqrt(variance)
    sharpeRatio = std === 0 ? 0 : (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR)
  }

  // 胜率与平均持仓天数(基于 BUY→SELL 回合)
  const { winRate, avgHoldingDays } = computeRoundTripStats(trades)

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown: maxDD,
    sharpeRatio,
    winRate,
    totalTrades: trades.length,
    avgHoldingDays,
  }
}

interface RoundTripStats {
  winRate: number
  avgHoldingDays: number
}

/**
 * 按 symbol 配对 BUY → 后续 SELL(取首次配对,简化)。
 * 一笔回合 = (BUY price, SELL price, SELL date - BUY date)。
 */
function computeRoundTripStats(trades: Trade[]): RoundTripStats {
  const openBySymbol = new Map<string, Trade>()
  const rounds: { pnl: number; days: number }[] = []

  // 按时间排序(BUY 和 SELL 按 date)
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    if (t.side === 'BUY') {
      if (!openBySymbol.has(t.symbolCode)) openBySymbol.set(t.symbolCode, t)
    } else {
      const open = openBySymbol.get(t.symbolCode)
      if (open) {
        const pnl = (t.price - open.price) * open.shares
        const days = Math.round(
          (Date.parse(t.date) - Date.parse(open.date)) / (1000 * 60 * 60 * 24),
        )
        rounds.push({ pnl, days: Math.max(days, 0) })
        openBySymbol.delete(t.symbolCode)
      }
    }
  }

  if (rounds.length === 0) {
    return { winRate: 0, avgHoldingDays: 0 }
  }

  const wins = rounds.filter((r) => r.pnl > 0).length
  const winRate = wins / rounds.length
  const avgHoldingDays = rounds.reduce((s, r) => s + r.days, 0) / rounds.length
  return { winRate, avgHoldingDays }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/backtest/metrics.test.ts
```

预期: PASS, 7 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/backtest/metrics.ts src/lib/backtest/metrics.test.ts
git commit -m "feat(backtest): metrics computation (return/drawdown/sharpe/winRate)"
```

---

## Task 5: engine.ts — runBacktest 主循环

**Files:**
- Create: `src/lib/backtest/engine.ts`
- Create: `src/lib/backtest/engine.test.ts`

> 核心回测循环。输入 spec + 日期范围,输出 BacktestOutput。
> 设计要点:
> 1. 不依赖 DB:接 `loadBars(symbol, from, to) => DailyBar[]` 与 `loadSymbols()` 注入。
> 2. 用 `lib/scheduler/isTradingDay` 过滤日期。
> 3. 调仓日 T 收盘 → T+1 open 撮合,所以循环按"信号日"展开,撮合在下一交易日。

- [ ] **Step 1: 写失败测试**

`src/lib/backtest/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runBacktest } from './engine'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

/**
 * 构造一个最小回测场景:
 * - 1 只股票 600000
 * - 5 个交易日 (T1..T5)
 * - 收盘价线性上升 10,11,12,13,14
 * - 策略:RETURN_5D > 0 (始终满足,5D return = (T5-T0)/T0,需 ≥ 6 根 bar;这里改为 > 0 的更简单条件)
 *
 * 为简化,我们用 PE_TTM(无需 lookback) + 阈值 > 0。让 5 天全部满足入场,
 * 在 T1 收盘买入,在 T4 触发"5 日涨太多 → SELL"(用 RETURN_5D < 阈值 或一个虚拟比较)。
 *
 * 但 RETURN_5D 也需要 6 bars。改用 VOLUME_RATIO 的"period=1"也需 2 bars。
 *
 * 简化策略:用 PE_TTM(无 lookback)。PE_TTM 在 close=10、EPS≈2.5 时 ≈ 4.0。
 * 入场: PE_TTM > 0 (永远成立)
 * 出场: 无条件出场 (空 conditions + AND → vacuously true)
 *
 * 持有 1 个交易日即被卖出。
 *
 * 信号:T1 收盘 → T2 open 买入 → T2 收盘(已持仓 1 天)→ T2 open(实际是 T3)卖出。
 *
 * 期望:
 *  - trades: BUY @ T2 open @ 11 + SELL @ T3 open @ 12(同日再买)/...我们手动指定。
 *
 * 为避免买卖同日循环,出场条件写成空 AND → OR 来区分:
 *  - entry: { combinator: 'AND', conditions: [] } (空 → vacuously true)
 *  - exit:  { combinator: 'OR',  conditions: [] } (空 → false → 永不触发)
 *
 * 这样:第一天就 BUY,只要未触发 exit 就一直持仓。本测试就跑 5 天,只买不卖,
 * 验证 5 天后 equity = cash_after_buy + shares × T5_close。
 */

function mkBar(date: string, close: number): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    amount: close * 1_000_000,
  }
}

describe('runBacktest — basic 5-day buy-and-hold', () => {
  const barsBySymbol = new Map<string, DailyBar[]>([
    [
      '600000',
      [
        mkBar('2026-09-01', 10),
        mkBar('2026-09-02', 11),
        mkBar('2026-09-03', 12),
        mkBar('2026-09-04', 13),
        mkBar('2026-09-05', 14),
      ],
    ],
  ])

  // mock close = 前一日 close (用于涨跌停判定)
  const barsByFill = new Map<string, DailyBar[]>([
    [
      '600000',
      [
        // T1 close = 10, T2 open = 11
        { ...mkBar('2026-09-02', 11), close: 10 },
        { ...mkBar('2026-09-03', 12), close: 11 },
        { ...mkBar('2026-09-04', 13), close: 12 },
        { ...mkBar('2026-09-05', 14), close: 13 },
      ],
    ],
  ])

  const spec: StrategySpec = {
    entry: { combinator: 'AND', conditions: [] }, // vacuously true
    exit: { combinator: 'OR', conditions: [] },   // vacuously false
    holding: { maxPositions: 1, positionSizePct: 100, maxDrawdownPct: 50 },
  }

  it('runs and produces trades + equity curve', async () => {
    const out = await runBacktest({
      spec,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      initialCash: 1_000_000,
      symbols: ['600000'],
      loadBars: async (sym, _from, _to) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym, _from, _to) => barsByFill.get(sym) ?? [],
      isTradingDay: (d) => {
        const day = new Date(d).getUTCDay()
        return day !== 0 && day !== 6
      },
    })

    // 验证基本形状
    expect(out.trades.length).toBeGreaterThanOrEqual(2) // 至少 1 BUY + (N/A 因为 no exit)
    expect(out.trades[0].side).toBe('BUY')
    // equity curve 5 个点
    expect(out.equityCurve.length).toBe(5)
    // final equity > initial cash(涨)
    expect(out.finalEquity).toBeGreaterThan(out.initialCash)
    expect(out.metrics.totalReturn).toBeGreaterThan(0)
  })

  it('uses T+1 open price for fill', async () => {
    const out = await runBacktest({
      spec,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      initialCash: 1_000_000,
      symbols: ['600000'],
      loadBars: async (sym) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym) => barsByFill.get(sym) ?? [],
      isTradingDay: (d) => {
        const day = new Date(d).getUTCDay()
        return day !== 0 && day !== 6
      },
    })

    // 第一笔 BUY 应该在 T2 09-02 成交,价格 = 11 (T2 open)
    expect(out.trades[0].date).toBe('2026-09-02')
    expect(out.trades[0].price).toBe(11)
  })

  it('is deterministic across runs', async () => {
    const args = {
      spec,
      startDate: '2026-09-01' as const,
      endDate: '2026-09-05' as const,
      initialCash: 1_000_000,
      symbols: ['600000'] as string[],
      loadBars: async (sym: string) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym: string) => barsByFill.get(sym) ?? [],
      isTradingDay: (d: string) => {
        const day = new Date(d).getUTCDay()
        return day !== 0 && day !== 6
      },
    }
    const a = await runBacktest(args)
    const b = await runBacktest(args)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/backtest/engine.test.ts
```

预期: FAIL — `Cannot find module './engine'`。

- [ ] **Step 3: 实现 engine.ts**

`src/lib/backtest/engine.ts`:

```ts
import { evaluateConditions } from '@/lib/strategy'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'
import { matchFill } from './fills'
import { computeMetrics } from './metrics'
import type {
  BacktestInput,
  BacktestOutput,
  EquityPoint,
  FillRequest,
  Position,
  RebalanceIntent,
  Trade,
} from './types'

/**
 * 引擎注入(便于测试):
 *  - loadBars(sym, from, to)  → 用于策略求值的日线(到 T 日为止)
 *  - loadBarsForFill(sym, from, to) → 用于 T+1 撮合的日线(含 prevClose = .close)
 *  - isTradingDay(dateStr)    → 由 lib/scheduler 提供
 *
 * 生产环境下,默认从 lib/data/query 注入。
 */
export interface BacktestEngineDeps {
  loadBars: (symbol: string, from: string, to: string) => Promise<DailyBar[]>
  loadBarsForFill: (symbol: string, from: string, to: string) => Promise<DailyBar[]>
  isTradingDay: (dateStr: string) => boolean
}

export async function runBacktest(
  rawInput: BacktestInput & BacktestEngineDeps,
): Promise<BacktestOutput> {
  const { spec, startDate, endDate, initialCash, symbols } = rawInput
  const loadBars = rawInput.loadBars
  const loadBarsForFill = rawInput.loadBarsForFill
  const isTradingDay = rawInput.isTradingDay

  // 1. 收集所有交易日(从 startDate 到 endDate)
  const tradingDates: string[] = []
  {
    const start = new Date(startDate + 'T00:00:00Z')
    const end = new Date(endDate + 'T00:00:00Z')
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().slice(0, 10)
      if (isTradingDay(ds)) tradingDates.push(ds)
    }
  }

  // 2. 预加载所有需要的 bars(用于求值 + 撮合)
  const fromForEval = addDays(startDate, -90) // 给因子留 lookback 余量
  const evalBarsBySym = new Map<string, DailyBar[]>()
  for (const sym of symbols ?? []) {
    const bars = await loadBars(sym, fromForEval, endDate)
    evalBarsBySym.set(sym, bars)
  }

  const fillBarsByDateSym = new Map<string, Map<string, DailyBar>>()
  for (const sym of symbols ?? []) {
    const fb = await loadBarsForFill(sym, startDate, endDate)
    const m = new Map<string, DailyBar>()
    for (const b of fb) m.set(b.tradeDate, b)
    fillBarsByDateSym.set(sym, m)
  }

  // 3. 主循环
  const positions = new Map<string, Position>()
  let cash = initialCash
  const trades: Trade[] = []
  const equityCurve: EquityPoint[] = []

  for (let i = 0; i < tradingDates.length; i++) {
    const date = tradingDates[i]

    // 3.1 标记到市场:用 date 当日收盘价计权益
    let mtmEquity = cash
    for (const [sym, pos] of positions) {
      const bars = evalBarsBySym.get(sym) ?? []
      const todayBar = bars.find((b) => b.tradeDate === date)
      if (todayBar) mtmEquity += pos.shares * todayBar.close
    }
    equityCurve.push({ date, equity: mtmEquity })

    // 3.2 计算 signals:entry / exit
    const entrySymbols: string[] = []
    const exitSymbols = new Set<string>()
    for (const sym of symbols ?? []) {
      const bars = evalBarsBySym.get(sym) ?? []
      const barsUpToToday = bars.filter((b) => b.tradeDate <= date)
      const hasPos = positions.has(sym)

      const entryHit = evaluateConditions(spec.entry, barsUpToToday)
      const exitHit = evaluateConditions(spec.exit, barsUpToToday)

      if (!hasPos && entryHit) entrySymbols.push(sym)
      if (hasPos && exitHit) exitSymbols.add(sym)
    }

    // 3.3 生成 rebalance plan
    const intents: RebalanceIntent[] = []

    // 3.3.1 SELL 现有持仓
    for (const sym of exitSymbols) {
      const pos = positions.get(sym)!
      const fb = fillBarsByDateSym.get(sym)
      const nextBar = nextFillBar(fb, date, tradingDates, i)
      if (!nextBar) continue
      // 用 last close 作为目标成交金额的近似(撮合用 open)
      const lastClose = lastCloseUpTo(evalBarsBySym.get(sym) ?? [], date)
      intents.push({
        symbolCode: sym,
        side: 'SELL',
        targetAmount: pos.shares * lastClose,
      })
    }

    // 3.3.2 BUY 新持仓(等权分配现金)
    const targetPositionCount = Math.max(1, spec.holding.maxPositions)
    const newEntries = entrySymbols.slice(0, targetPositionCount - positions.size + exitSymbols.size)
    const perPositionAmount = (cash * (spec.holding.positionSizePct / 100)) / newEntries.length
    for (const sym of newEntries) {
      if (positions.has(sym) || exitSymbols.has(sym)) continue
      const lastClose = lastCloseUpTo(evalBarsBySym.get(sym) ?? [], date)
      intents.push({
        symbolCode: sym,
        side: 'BUY',
        targetAmount: perPositionAmount,
      })
    }

    // 3.4 撮合(用 T+1 的 bar)
    if (intents.length > 0 && i + 1 < tradingDates.length) {
      for (const intent of intents) {
        const fb = fillBarsByDateSym.get(intent.symbolCode)
        const nextBar = nextFillBar(fb, date, tradingDates, i)
        if (!nextBar) continue

        const req: FillRequest = {
          intent,
          nextBar,
          availableShares: positions.get(intent.symbolCode)?.shares,
          availableCash: cash,
        }
        const r = matchFill(req)
        if (r.status !== 'filled' || !r.trade) continue
        const tr = r.trade
        trades.push(tr)

        if (tr.side === 'BUY') {
          const totalCost = tr.amount + tr.fee
          cash -= totalCost
          const existing = positions.get(tr.symbolCode)
          if (existing) {
            const totalShares = existing.shares + tr.shares
            const avgPrice = (existing.costPrice * existing.shares + tr.price * tr.shares) / totalShares
            positions.set(tr.symbolCode, {
              symbolCode: tr.symbolCode,
              shares: totalShares,
              costPrice: avgPrice,
              entryDate: existing.entryDate,
            })
          } else {
            positions.set(tr.symbolCode, {
              symbolCode: tr.symbolCode,
              shares: tr.shares,
              costPrice: tr.price,
              entryDate: tr.date,
            })
          }
        } else {
          // SELL
          cash += tr.amount - tr.fee
          const existing = positions.get(tr.symbolCode)
          if (existing) {
            const remaining = existing.shares - tr.shares
            if (remaining <= 0) {
              positions.delete(tr.symbolCode)
            } else {
              positions.set(tr.symbolCode, {
                symbolCode: tr.symbolCode,
                shares: remaining,
                costPrice: existing.costPrice,
                entryDate: existing.entryDate,
              })
            }
          }
        }
      }
    }
  }

  // 4. 计算指标
  const metrics = computeMetrics({ initialCash, equityCurve, trades })

  return {
    initialCash,
    finalEquity: equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCash,
    metrics,
    trades,
    equityCurve,
  }
}

/** 取截至 date 的最后一根 bar 的 close(用于估算目标金额) */
function lastCloseUpTo(bars: DailyBar[], date: string): number {
  const eligible = bars.filter((b) => b.tradeDate <= date)
  if (eligible.length === 0) return 0
  return eligible[eligible.length - 1].close
}

/** 取下一个交易日 bar(用于撮合);不存在返回 null */
function nextFillBar(
  fb: Map<string, DailyBar> | undefined,
  fromDate: string,
  tradingDates: string[],
  currentIdx: number,
): DailyBar | null {
  if (!fb) return null
  for (let j = currentIdx + 1; j < tradingDates.length; j++) {
    const nd = tradingDates[j]
    const bar = fb.get(nd)
    if (bar) return bar
  }
  return null
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/backtest/engine.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 检查覆盖率**

```bash
pnpm test:cov src/lib/backtest/
```

预期: `lib/backtest/*` 行覆盖 ≥ 90%。

- [ ] **Step 6: 提交**

```bash
git add src/lib/backtest/engine.ts src/lib/backtest/engine.test.ts
git commit -m "feat(backtest): runBacktest main loop with T+1 fills"
```

---

## Task 6: query.ts — DB CRUD

**Files:**
- Create: `src/lib/backtest/query.ts`

> Server Action 用 query 函数读写 DB。RLS 隔离由 `auth.uid() = user_id` 保证。

- [ ] **Step 1: 实现 query.ts**

`src/lib/backtest/query.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { BacktestOutput } from './types'

export interface BacktestRunRow {
  id: string
  userId: string
  strategyId: string
  startDate: string
  endDate: string
  initialCash: number
  status: 'running' | 'completed' | 'failed'
  result: BacktestOutput | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
}

interface DbRow {
  id: string
  user_id: string
  strategy_id: string
  start_date: string
  end_date: string
  initial_cash: string // numeric → string
  status: 'running' | 'completed' | 'failed'
  result: BacktestOutput | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

function rowToRun(row: DbRow): BacktestRunRow {
  return {
    id: row.id,
    userId: row.user_id,
    strategyId: row.strategy_id,
    startDate: row.start_date,
    endDate: row.end_date,
    initialCash: Number(row.initial_cash),
    status: row.status,
    result: row.result,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

/** 列出当前用户所有回测运行,按 started_at 降序 */
export async function listBacktestRuns(): Promise<BacktestRunRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listBacktestRuns failed: ${error.message}`)
  return (data ?? []).map(rowToRun)
}

/** 列出某个策略的回测运行 */
export async function listBacktestRunsByStrategy(strategyId: string): Promise<BacktestRunRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .eq('strategy_id', strategyId)
    .order('started_at', { ascending: false })
  if (error) throw new Error(`listBacktestRunsByStrategy failed: ${error.message}`)
  return (data ?? []).map(rowToRun)
}

/** 取单个回测运行(必须在当前用户下) */
export async function getBacktestRun(id: string): Promise<BacktestRunRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_backtest_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getBacktestRun failed: ${error.message}`)
  return data ? rowToRun(data) : null
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/backtest/query.ts
git commit -m "feat(backtest): query helpers list/get with RLS"
```

---

## Task 7: actions.ts — Server Action `createBacktestRunAction`

**Files:**
- Create: `src/lib/backtest/actions.ts`

> Server Action: 接收 (strategyId, startDate, endDate, initialCash),
> 同步调用 runBacktest,完成后更新 result 字段,返回新 run id。
> Phase 4 才会改为异步队列。

- [ ] **Step 1: 实现 actions.ts**

`src/lib/backtest/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStrategy } from '@/lib/strategy'
import { getProvider } from '@/lib/data'
import { isTradingDay } from '@/lib/scheduler'
import { runBacktest } from './engine'
import type { DailyBar } from '@/lib/data'

export interface BacktestFormState {
  error?: string
  fieldErrors?: Record<string, string[]>
} | null

/**
 * 创建并同步运行一次回测。
 * 同步执行(假设单次 < 5s);Phase 4 改为异步。
 */
export async function createBacktestRunAction(
  strategyId: string,
  _prev: BacktestFormState,
  formData: FormData,
): Promise<BacktestFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const startDate = String(formData.get('startDate') ?? '').trim()
  const endDate = String(formData.get('endDate') ?? '').trim()
  const initialCashRaw = Number(formData.get('initialCash') ?? 1_000_000)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { fieldErrors: { date: ['errors.invalid_date'] } }
  }
  if (new Date(endDate) < new Date(startDate)) {
    return { fieldErrors: { date: ['errors.end_before_start'] } }
  }
  if (!(initialCashRaw > 0)) {
    return { fieldErrors: { initialCash: ['errors.invalid_cash'] } }
  }

  const strategy = await getStrategy(strategyId)
  if (!strategy) return { error: 'errors.strategy_not_found' }

  // 1. 插入 running 行
  const { data: inserted, error: insertErr } = await supabase
    .from('trade260915a_backtest_runs')
    .insert({
      user_id: user.id,
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_cash: initialCashRaw,
      status: 'running',
    })
    .select('id')
    .single()
  if (insertErr || !inserted) return { error: insertErr?.message ?? 'errors.insert_failed' }

  const runId = inserted.id

  // 2. 拉取候选股票(本期默认全主板)
  const provider = getProvider()
  const symbols = await provider.listSymbols()
  const symbolCodes = symbols.map((s) => s.code)

  // 3. 同步执行回测
  try {
    const output = await runBacktest({
      spec: strategy.spec,
      startDate,
      endDate,
      initialCash: initialCashRaw,
      symbols: symbolCodes,
      loadBars: async (sym, from, to) => {
        return provider.getDailyBars(sym, from, to)
      },
      loadBarsForFill: async (sym, from, to) => {
        return provider.getDailyBars(sym, from, to)
      },
      isTradingDay,
    })

    await supabase
      .from('trade260915a_backtest_runs')
      .update({
        status: 'completed',
        result: output,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  } catch (err: any) {
    await supabase
      .from('trade260915a_backtest_runs')
      .update({
        status: 'failed',
        error_message: String(err?.message ?? err),
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return { error: 'errors.backtest_failed' }
  }

  revalidatePath('/backtest')
  revalidatePath('/strategy')
  revalidatePath(`/strategy/${strategyId}`)
  redirect(`/backtest/${runId}`)
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/backtest/actions.ts
git commit -m "feat(backtest): createBacktestRunAction sync execution"
```

---

## Task 8: index.ts — public API

**Files:**
- Create: `src/lib/backtest/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/backtest/index.ts`:

```ts
// 公共 API
export type {
  BacktestInput,
  BacktestOutput,
  Trade,
  EquityPoint,
  Metrics,
  FeeConfig,
  Position,
  RebalanceIntent,
} from './types'
export { matchFill, computeFee, DEFAULT_FEE_CONFIG, LIMIT_PCT, LOT_SIZE } from './fills'
export { computeMetrics } from './metrics'
export { runBacktest } from './engine'
export {
  listBacktestRuns,
  listBacktestRunsByStrategy,
  getBacktestRun,
  type BacktestRunRow,
} from './query'
export { createBacktestRunAction, type BacktestFormState } from './actions'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/backtest/index.ts
git commit -m "feat(backtest): public API barrel"
```

---

## Task 9: i18n — `quant.backtest.*` / `quant.metrics.*`

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 的 `quant` 对象下添加 backtest / metrics 子树**

找到 `"quant": { ... }` 内,在大括号闭合 `}` 前插入(注意逗号):

```json
,
    "backtest": {
      "listTitle": "历史回测",
      "newButton": "运行回测",
      "empty": "还没有回测运行,从策略详情页创建一个",
      "form": {
        "title": "运行回测",
        "startDate": "开始日期",
        "endDate": "结束日期",
        "initialCash": "初始资金",
        "submit": "开始回测",
        "submitting": "回测运行中...",
        "cancel": "取消"
      },
      "list": {
        "runAt": "运行时间",
        "strategy": "策略",
        "period": "回测区间",
        "totalReturn": "总收益",
        "status": "状态",
        "view": "查看"
      },
      "status": {
        "running": "运行中",
        "completed": "已完成",
        "failed": "失败"
      },
      "report": {
        "title": "回测报告",
        "summary": "策略在 {from} 至 {to} 的回测表现",
        "noTrades": "本次回测没有产生交易",
        "tradesTable": "交易明细",
        "equityCurve": "权益曲线"
      }
    },
    "metrics": {
      "totalReturn": "总收益",
      "annualizedReturn": "年化收益",
      "maxDrawdown": "最大回撤",
      "sharpeRatio": "夏普比率",
      "winRate": "胜率",
      "totalTrades": "总交易笔数",
      "avgHoldingDays": "平均持仓天数",
      "finalEquity": "最终权益"
    },
    "errors": {
      "invalid_date": "日期格式无效 (YYYY-MM-DD)",
      "end_before_start": "结束日期不能早于开始日期",
      "invalid_cash": "初始资金必须为正数",
      "strategy_not_found": "策略不存在",
      "backtest_failed": "回测运行失败",
      "insert_failed": "回测记录创建失败"
    }
```

> **注意:** `errors.unauthorized` 等共享错误从 Phase 1 沿用,本 Phase 只新增 quant 域内的 errors。

- [ ] **Step 2: 在 en.json 的 `quant` 对象下添加 backtest / metrics 子树**

同上结构,英文文案:

```json
,
    "backtest": {
      "listTitle": "Backtest History",
      "newButton": "Run Backtest",
      "empty": "No backtest runs yet. Create one from a strategy detail page.",
      "form": {
        "title": "Run Backtest",
        "startDate": "Start Date",
        "endDate": "End Date",
        "initialCash": "Initial Cash",
        "submit": "Run Backtest",
        "submitting": "Running backtest...",
        "cancel": "Cancel"
      },
      "list": {
        "runAt": "Run At",
        "strategy": "Strategy",
        "period": "Period",
        "totalReturn": "Total Return",
        "status": "Status",
        "view": "View"
      },
      "status": {
        "running": "Running",
        "completed": "Completed",
        "failed": "Failed"
      },
      "report": {
        "title": "Backtest Report",
        "summary": "Strategy performance from {from} to {to}",
        "noTrades": "This backtest produced no trades.",
        "tradesTable": "Trades",
        "equityCurve": "Equity Curve"
      }
    },
    "metrics": {
      "totalReturn": "Total Return",
      "annualizedReturn": "Annualized Return",
      "maxDrawdown": "Max Drawdown",
      "sharpeRatio": "Sharpe Ratio",
      "winRate": "Win Rate",
      "totalTrades": "Total Trades",
      "avgHoldingDays": "Avg Holding Days",
      "finalEquity": "Final Equity"
    },
    "errors": {
      "invalid_date": "Invalid date format (YYYY-MM-DD)",
      "end_before_start": "End date must be on or after start date",
      "invalid_cash": "Initial cash must be positive",
      "strategy_not_found": "Strategy not found",
      "backtest_failed": "Backtest failed",
      "insert_failed": "Failed to create backtest record"
    }
```

- [ ] **Step 3: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/zh.json', 'utf8'))"
node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json', 'utf8'))"
```

预期: 无输出(解析成功)。

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): quant.backtest and quant.metrics namespaces"
```

---

## Task 10: EquityCurveChart 组件

**Files:**
- Create: `src/components/backtest/equity-curve-chart.tsx`

> 用 `lightweight-charts` (Phase 0 已安装) 渲染权益曲线。
> 组件为 Client (`'use client'`),接收 `data: EquityPoint[]` 作 prop。

- [ ] **Step 1: 实现 equity-curve-chart.tsx**

`src/components/backtest/equity-curve-chart.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import type { EquityPoint } from '@/lib/backtest'

interface EquityCurveChartProps {
  data: EquityPoint[]
  height?: number
}

/**
 * 权益曲线图。x 轴日期, y 轴权益(元)。
 */
export function EquityCurveChart({ data, height = 320 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#374151',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      timeScale: {
        timeVisible: false,
        borderColor: '#e5e7eb',
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
      },
    })
    chartRef.current = chart

    const series = chart.addAreaSeries({
      lineColor: '#6366f1', // indigo-500
      topColor: 'rgba(99, 102, 241, 0.4)',
      bottomColor: 'rgba(99, 102, 241, 0.04)',
      lineWidth: 2,
    })
    seriesRef.current = series

    series.setData(
      data.map((p) => ({
        time: p.date,
        value: p.equity,
      })),
    )

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // data 变化时重画
  }, [data, height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS(`lightweight-charts` 在 Phase 0 已引入)。

- [ ] **Step 3: 提交**

```bash
git add src/components/backtest/equity-curve-chart.tsx
git commit -m "feat(backtest-ui): EquityCurveChart with lightweight-charts"
```

---

## Task 11: KlineChart 组件(可复用)

**Files:**
- Create: `src/components/backtest/kline-chart.tsx`

> 通用 K 线组件(Phase 0 `/market/[symbol]` 已用到同样模式;本组件为可复用封装,
> 本 Phase 在 /backtest 报告中暂未直接使用,但为 spec §4 列出的交付件,以及
> Phase 3 / Phase 4 复用准备)。

- [ ] **Step 1: 实现 kline-chart.tsx**

`src/components/backtest/kline-chart.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import type { DailyBar } from '@/lib/data'

interface KlineChartProps {
  data: DailyBar[]
  height?: number
}

/**
 * K 线图(蜡烛图)。日线 / 分钟线通用。
 */
export function KlineChart({ data, height = 360 }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#374151',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      timeScale: {
        borderColor: '#e5e7eb',
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
      },
    })
    chartRef.current = chart

    const series = chart.addCandlestickSeries({
      upColor: '#ef4444',  // A 股红涨绿跌
      downColor: '#10b981',
      borderUpColor: '#ef4444',
      borderDownColor: '#10b981',
      wickUpColor: '#ef4444',
      wickDownColor: '#10b981',
    })
    seriesRef.current = series

    series.setData(
      data.map((b) => ({
        time: b.tradeDate,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [data, height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/components/backtest/kline-chart.tsx
git commit -m "feat(backtest-ui): reusable KlineChart with A-share color convention"
```

---

## Task 12: MetricsTable 组件

**Files:**
- Create: `src/components/backtest/metrics-table.tsx`
- Create: `src/components/backtest/metrics-table.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/backtest/metrics-table.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/components/providers/language-provider'
import { MetricsTable } from './metrics-table'
import type { Metrics } from '@/lib/backtest'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

const sampleMetrics: Metrics = {
  totalReturn: 0.123,
  annualizedReturn: 0.087,
  maxDrawdown: -0.082,
  sharpeRatio: 1.24,
  winRate: 0.45,
  totalTrades: 28,
  avgHoldingDays: 5.2,
}

describe('MetricsTable', () => {
  it('renders all 7 metric labels', () => {
    renderWith(<MetricsTable metrics={sampleMetrics} initialCash={1_000_000} finalEquity={1_123_000} />)
    expect(screen.getByText(/总收益|total return/i)).toBeInTheDocument()
    expect(screen.getByText(/年化|annualized/i)).toBeInTheDocument()
    expect(screen.getByText(/最大回撤|max drawdown/i)).toBeInTheDocument()
    expect(screen.getByText(/夏普|sharpe/i)).toBeInTheDocument()
    expect(screen.getByText(/胜率|win rate/i)).toBeInTheDocument()
    expect(screen.getByText(/总交易|total trades/i)).toBeInTheDocument()
    expect(screen.getByText(/平均持仓|avg holding/i)).toBeInTheDocument()
  })

  it('formats total return with sign and percent', () => {
    renderWith(<MetricsTable metrics={sampleMetrics} initialCash={1_000_000} finalEquity={1_123_000} />)
    expect(screen.getByText(/\+12\.30%/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/components/backtest/metrics-table.test.tsx
```

预期: FAIL — `Cannot find module './metrics-table'`。

- [ ] **Step 3: 实现 metrics-table.tsx**

`src/components/backtest/metrics-table.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/components/providers/language-provider'
import type { Metrics } from '@/lib/backtest'

interface MetricsTableProps {
  metrics: Metrics
  initialCash: number
  finalEquity: number
}

interface MetricItem {
  labelKey: string
  value: string
  /** 是否为负数(用于上色) */
  negative?: boolean
}

function formatPct(v: number, withSign = true): string {
  const pct = v * 100
  const sign = withSign && pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function MetricsTable({ metrics, initialCash, finalEquity }: MetricsTableProps) {
  const { t } = useLanguage()

  const items: MetricItem[] = [
    { labelKey: 'quant.metrics.totalReturn', value: formatPct(metrics.totalReturn), negative: metrics.totalReturn < 0 },
    { labelKey: 'quant.metrics.annualizedReturn', value: formatPct(metrics.annualizedReturn), negative: metrics.annualizedReturn < 0 },
    { labelKey: 'quant.metrics.maxDrawdown', value: formatPct(metrics.maxDrawdown), negative: metrics.maxDrawdown < 0 },
    { labelKey: 'quant.metrics.sharpeRatio', value: metrics.sharpeRatio.toFixed(2) },
    { labelKey: 'quant.metrics.winRate', value: formatPct(metrics.winRate, false) },
    { labelKey: 'quant.metrics.totalTrades', value: String(metrics.totalTrades) },
    { labelKey: 'quant.metrics.avgHoldingDays', value: `${metrics.avgHoldingDays.toFixed(1)} d` },
    { labelKey: 'quant.metrics.finalEquity', value: `¥${finalEquity.toFixed(2)}` },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      {items.map((it) => (
        <Card key={it.labelKey}>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500">{t(it.labelKey) as string}</div>
            <div
              className={
                'mt-1 text-2xl font-semibold ' +
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

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/components/backtest/metrics-table.test.tsx
```

预期: PASS, 2 tests。

- [ ] **Step 5: 提交**

```bash
git add src/components/backtest/metrics-table.tsx src/components/backtest/metrics-table.test.tsx
git commit -m "feat(backtest-ui): MetricsTable with 8 metric cards"
```

---

## Task 13: TradesTable 组件

**Files:**
- Create: `src/components/backtest/trades-table.tsx`

> 简单展示 trade 明细。沿用 shadcn `Table` (Task 1 已加入)。

- [ ] **Step 1: 实现 trades-table.tsx**

`src/components/backtest/trades-table.tsx`:

```tsx
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
```

> **简化:** 表头暂用硬编码英文 / 中文(避免再开 i18n key)。后续 Phase 按需补。

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/components/backtest/trades-table.tsx
git commit -m "feat(backtest-ui): TradesTable with shadcn Table"
```

---

## Task 14: /backtest 列表页

**Files:**
- Create: `src/app/(dashboard)/backtest/page.tsx`

> Server Component。直接查 DB 列出当前用户所有回测运行。
> 表头:运行时间 / 策略 / 区间 / 总收益 / 状态。点击行 → `/backtest/[id]`。

- [ ] **Step 1: 实现列表页**

`src/app/(dashboard)/backtest/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listBacktestRuns, type BacktestRunRow } from '@/lib/backtest'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function BacktestListPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const lang = getLanguage()
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
        <Link href={`/backtest/${run.id}` as any} className="text-indigo-600 hover:underline text-sm">
          {lang === 'en' ? 'View' : '查看'}
        </Link>
      </TableCell>
    </TableRow>
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
git add src/app/(dashboard)/backtest/page.tsx
git commit -m "feat(backtest-ui): /backtest list page"
```

---

## Task 15: /backtest/[id] 报告页

**Files:**
- Create: `src/app/(dashboard)/backtest/[id]/page.tsx`

> Server Component 拉数据,内嵌 Client 图表。

- [ ] **Step 1: 实现报告页**

`src/app/(dashboard)/backtest/[id]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBacktestRun } from '@/lib/backtest'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MetricsTable } from '@/components/backtest/metrics-table'
import { TradesTable } from '@/components/backtest/trades-table'
import { EquityCurveChart } from '@/components/backtest/equity-curve-chart'
import { getLanguage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BacktestReportPage({ params }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { id } = await params
  const run = await getBacktestRun(id)
  if (!run) notFound()

  const lang = getLanguage()

  // 取策略名
  const { data: strategy } = await supabase
    .from('trade260915a_strategies')
    .select('name')
    .eq('id', run.strategyId)
    .single()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {strategy?.name ?? 'Backtest'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {lang === 'en' ? 'From' : '回测区间'} {run.startDate} → {run.endDate}
          </p>
        </div>
        <Link
          href={`/strategy/${run.strategyId}` as any}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← {lang === 'en' ? 'Back to Strategy' : '返回策略'}
        </Link>
      </div>

      {run.status === 'running' && (
        <Alert>
          <AlertDescription>
            {lang === 'en' ? 'Backtest is still running...' : '回测运行中...'}
          </AlertDescription>
        </Alert>
      )}

      {run.status === 'failed' && (
        <Alert variant="destructive">
          <AlertDescription>
            {lang === 'en' ? 'Backtest failed: ' : '回测失败: '}
            {run.errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {run.status === 'completed' && run.result && (
        <>
          <MetricsTable
            metrics={run.result.metrics}
            initialCash={run.result.initialCash}
            finalEquity={run.result.finalEquity}
          />

          <Card>
            <CardHeader>
              <CardTitle>
                {lang === 'en' ? 'Equity Curve' : '权益曲线'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EquityCurveChart data={run.result.equityCurve} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {lang === 'en' ? 'Trades' : '交易明细'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {run.result.trades.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {lang === 'en'
                    ? 'This backtest produced no trades.'
                    : '本次回测没有产生交易'}
                </p>
              ) : (
                <TradesTable trades={run.result.trades} />
              )}
            </CardContent>
          </Card>
        </>
      )}
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
git add src/app/(dashboard)/backtest/[id]/page.tsx
git commit -m "feat(backtest-ui): /backtest/[id] report page with metrics + chart + trades"
```

---

## Task 16: 接入 /strategy/[id] — "运行回测" 按钮 + 表单

**Files:**
- Create: `src/components/backtest/run-backtest-form.tsx`
- Modify: `src/app/(dashboard)/strategy/[id]/page.tsx`(添加 "运行回测" 按钮)

- [ ] **Step 1: 实现 RunBacktestForm 组件**

`src/components/backtest/run-backtest-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLanguage } from '@/components/providers/language-provider'
import { createBacktestRunAction } from '@/lib/backtest'

interface RunBacktestFormProps {
  strategyId: string
}

export function RunBacktestForm({ strategyId }: RunBacktestFormProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createBacktestRunAction(strategyId, null, fd)
      if (result?.error) setServerError(t(result.error) || result.error)
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="default">
        {t('quant.backtest.newButton') as string}
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('quant.backtest.form.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="startDate">{t('quant.backtest.form.startDate')}</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={yearAgo}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endDate">{t('quant.backtest.form.endDate')}</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={today}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="initialCash">{t('quant.backtest.form.initialCash')}</Label>
              <Input
                id="initialCash"
                name="initialCash"
                type="number"
                min={1}
                step={10000}
                defaultValue={1_000_000}
                required
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? (t('quant.backtest.form.submitting') as string)
                : (t('quant.backtest.form.submit') as string)}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('quant.backtest.form.cancel') as string}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 在 strategy detail 页接入 RunBacktestForm**

修改 `src/app/(dashboard)/strategy/[id]/page.tsx`,在策略详情区下方添加:

```tsx
import { RunBacktestForm } from '@/components/backtest/run-backtest-form'

// ... 既有 strategy detail 渲染 ...

// 在底部添加(具体位置以既有结构为准):
<section className="mt-6">
  <RunBacktestForm strategyId={strategy.id} />
</section>
```

> 详细 diff 由实现者根据 Phase 1 完成的 `strategy/[id]/page.tsx` 实际结构决定。
> 要求:把 `<RunBacktestForm strategyId={strategy.id} />` 渲染进页面(放在 spec 区下方即可)。

- [ ] **Step 3: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/components/backtest/run-backtest-form.tsx src/app/(dashboard)/strategy/[id]/page.tsx
git commit -m "feat(backtest-ui): RunBacktestForm integrated into strategy detail"
```

---

## Task 17: 验证 — 全量测试 + 覆盖率 + 端到端冒烟

- [ ] **Step 1: 全量单测**

```bash
pnpm test
```

预期: 全部 PASS。

- [ ] **Step 2: 覆盖率检查**

```bash
pnpm test:cov src/lib/backtest/
```

预期:
- `lib/backtest/types.ts`: 100%
- `lib/backtest/fills.ts`: ≥ 95%
- `lib/backtest/metrics.ts`: ≥ 95%
- `lib/backtest/engine.ts`: ≥ 90%
- **整体 `lib/backtest/*` ≥ 90% 行覆盖**(满足 spec §8.1)

- [ ] **Step 3: 编译 + 类型检查**

```bash
pnpm typecheck
pnpm lint
```

预期: PASS。

- [ ] **Step 4: 端到端冒烟(本地开发)**

```bash
pnpm dev
```

手动验证(在浏览器):
1. 登录 / 注册一个新账号
2. 进入 `/strategy/new`,新建策略(任选 1 个因子 + 阈值 0)
3. 保存草稿 → 跳到 `/strategy/[id]`
4. 点击 "运行回测",填日期(默认近 1 年)与初始资金(1,000,000)
5. 提交 → 跳到 `/backtest/[runId]`
6. 验证看到:
   - 8 个指标卡片(总收益 / 年化 / 最大回撤 / 夏普 / 胜率 / 总交易笔数 / 平均持仓天数 / 最终权益)
   - 权益曲线图(有数据点)
   - 交易明细表(可能有 0 行,本期允许空交易)
7. 回到 `/backtest` 列表,看到这条运行

- [ ] **Step 5: 提交(若本次没改代码可跳过)**

```bash
git status  # 应是 clean;若有临时改动,提交
```

---

## 风险与注意

- **同步回测时长:** 单次回测在 mock 数据上约 1-3 秒(主板 3000 股 × 252 天)。
  Vercel Server Action 默认 timeout 60s;若超时,需分批(后续 Phase 4)。
  本 Phase DoD 不要求支持 5 年回测,默认 1 年。

- **lightweight-charts SSR:** 必须 `'use client'`,否则 `window is not defined`。
  所有 charts 包在 Client Component 中。

- **TradesTable 表头 i18n:** 当前用硬编码中英混排文字(简化),后续统一抽 i18n key。

- **Mock 数据可用性:** 依赖 Phase 0 已 seed 的主板股票 + 日线。
  若本地 dev 环境未运行 `pnpm dlx supabase start` + ingest 端点,
  回测会因为 `getDailyBars` 返回空 → trades 为空。
  DoD 接受空交易(标注 "本次回测没有产生交易"),但最好先手动触发 cron `ingest-daily` 一次。

- **覆盖率:** `engine.ts` 内的 rebalance 计划分支较多,需确保测试覆盖 BUY/SELL/exit 三个分支。
  若 `< 90%`,补测试用例(在 `engine.test.ts` 中加 scenario)。

---

## 验收标准 (DoD)

- [ ] 全部 17 个 Task 完成且 commit
- [ ] `pnpm test` 全 PASS,`lib/backtest/*` 行覆盖 ≥ 90%
- [ ] `pnpm typecheck` PASS
- [ ] 浏览器:从 `/strategy/[id]` 一键运行回测,跳到 `/backtest/[id]` 看到完整报告
- [ ] `/backtest` 列表页显示当前用户所有回测运行
- [ ] RLS 隔离:另一用户登录看不到此用户的回测

---

## 后续 Phase 接缝

- **Phase 3 (trading):** `cron/run-strategies` 调 `evaluateConditions` + `matchFill` + risk;
  回测结果可作为"前向验证"对比模拟交易。
- **Phase 4 (risk):** `riskEngine.evaluate(plan, ctx)` 接入 `cron/run-strategies`;
  回测后端未来可加"实时模拟"按钮,沿用同一撮合 / 指标代码。
- **Phase 4 (async):** `runBacktest` 超时改为异步队列(`trade260915a_backtest_jobs` 表)。
- **Phase 4 (advanced metrics):** IC / Alpha / Beta / 因子暴露。
