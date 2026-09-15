# Quant Trading Phase 4 — 风控 + 调度完善 + 实盘接口预留 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `lib/risk/*` 完整模块(6 条规则 + 规则引擎 + peak 查询 + equity snapshot),把风控接入 `/api/cron/run-strategies`,新增 `trade260915a_portfolio_equity_snapshots` 表并在 `/api/cron/settle-pending` 后写 snapshot,扩展 `BrokerAdapter` 接口为实盘券商预留字段,补齐实盘 Broker / 真实数据源接入指南,并在 `/portfolio` 与 `/strategy/[id]` 暴露风控状态(peak equity / 当前回撤 / 止损原因 / 风控决策日志)。所有 cron 端点统一包一层带错误告警 + 日志的 runner。

**Architecture:** `lib/risk/rules.ts` 把 6 条规则各自实现成纯函数(签名 `(plan, ctx) => RiskAction`),`lib/risk/engine.ts` 按顺序求值(先 allow,再 modify,再 reject / stop);stop 直接把 portfolio 标为 `stopped` 并写 `stop_reason`。`lib/risk/peak.ts` 查 `trade260915a_portfolio_equity_snapshots` 的 MAX(equity)。`lib/risk/equity-snapshot.ts` 在 settle-pending cron 落库(每 portfolio × trade_date 一行,唯一索引去重)。`lib/scheduler/cron-runner.ts` 是 Next.js Route Handler 通用 try/catch wrapper,失败时 `console.error` + 把错误落到 `trade260915a_strategy_run_log.notes`。`BrokerAdapter` 在 Phase 3 基础上加 `clientOrderId` / `sessionToken` / `accountId` 字段(纯预留,PaperBroker 不读)。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · Supabase Postgres + RLS · Vitest · lightweight-charts (沿用 Phase 0-3) · shadcn/ui (沿用 Phase 0-3)

**Spec:** `docs/superpowers/specs/2026-09-15-quant-trading-design.md` (Phase 4 章节 §9 + §6.6 + §10)

**依赖前置 (来自 Phase 0 / 1 / 2 / 3):**
- `src/lib/data` (`MarketDataProvider` / `getDailyBars` / `getLatestBar`)
- `src/lib/scheduler` (`isTradingDay` + 时段工具)
- `src/lib/strategy` (`StrategySpec` / `evaluateConditions`)
- `src/lib/backtest` (`runBacktest` / `matchFill`)
- `src/lib/trading` (`BrokerAdapter` / `PaperBroker` / `computeT1Unlock` / `generateRebalancePlan` / `RebalanceIntent` / `RebalancePlan` / `Portfolio` / `Position`)
- `src/lib/supabase/server` 与 `src/lib/supabase/service-role`
- 3 个 cron 端点 `/api/cron/run-strategies` / `settle-pending` / `t1-settle` 已实现
- 主板股票已 seed,日线已有数据
- `src/app/(dashboard)/portfolio/page.tsx` 已渲染 portfolio 摘要 + 持仓表

---

## 全局约定

- **新表:** `trade260915a_portfolio_equity_snapshots`(在 `005_trading_schema.sql` 之后追加,新建 `006_risk_schema.sql`)。
- **i18n namespace:** 新增 `quant.risk.*` / `quant.cron.*` / `quant.portfolio.peakEquity` / `quant.portfolio.drawdown`。
- **Git 节奏:** 每个 Task 末尾独立提交。
- **TDD:** 每个 lib/ 纯函数任务先写失败测试,再写实现。
- **路径别名:** 沿用 `@/lib/...` `@/components/...` `@/app/...`。
- **数字精度:** 沿用 Phase 2-3(NUMERIC(12,4) 价格 / NUMERIC(14,2) 金额 / INTEGER 股数)。
- **RiskAction:** 4 种 `allow` / `modify` / `reject` / `stop`,见 spec §6.6;`stop` 写 `portfolio.stop_reason` 并 `status='stopped'`(停止后该 portfolio 不再被 cron 处理)。
- **快照写入时机:** `/api/cron/settle-pending` 完成撮合后,逐 portfolio 计算 `cash + Σ(shares × lastClose)` 写一行;唯一索引 `(portfolio_id, trade_date)` 兜底幂等。
- **风控求值时机:** 在 `/api/cron/run-strategies` 中,`generateRebalancePlan` 返回 plan 后立刻 `riskEngine.evaluate(plan, ctx)`;若引擎返回 `stop` 则跳过该 portfolio 后续所有订单落库;若返回 `modify` 则用改写后的 `intents` 继续 `submitOrder`。
- **覆盖率门槛**(沿用 spec §8.1): `lib/risk/*` 行覆盖 ≥ 90%,函数覆盖 ≥ 90%。

---

## Task 1: equity_snapshots schema migration

**Files:**
- Create: `supabase/migrations/006_risk_schema.sql`

> 一张新表 + RLS。RLS 直接 denormalize `user_id`(沿用 Phase 3 §10 R6 缓解)。

- [ ] **Step 1: 创建 migration**

`supabase/migrations/006_risk_schema.sql`:

```sql
-- 006_risk_schema.sql
-- Phase 4: 风控所需的 equity snapshots 表。

CREATE TABLE trade260915a_portfolio_equity_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  trade_date   DATE NOT NULL,
  equity       NUMERIC(14, 2) NOT NULL,
  cash         NUMERIC(14, 2) NOT NULL,
  market_value NUMERIC(14, 2) NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, trade_date)
);

CREATE INDEX trade260915a_equity_snapshots_portfolio_idx
  ON trade260915a_portfolio_equity_snapshots(portfolio_id, trade_date DESC);
CREATE INDEX trade260915a_equity_snapshots_user_idx
  ON trade260915a_portfolio_equity_snapshots(user_id, trade_date DESC);

ALTER TABLE trade260915a_portfolio_equity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- service_role 走单独的 policy(全权,绕过 user_id 校验,cron 用)
CREATE POLICY "Service role manages equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: 应用 migration**

```bash
pnpm dlx supabase db reset
```

预期: 全部 migration 成功。

- [ ] **Step 3: 验证表与 RLS**

```bash
pnpm dlx supabase db psql --local -c "\dt trade260915a_portfolio_equity_snapshots"
pnpm dlx supabase db psql --local -c "
  SELECT indexname FROM pg_indexes
   WHERE tablename = 'trade260915a_portfolio_equity_snapshots'
     AND indexname = 'trade260915a_equity_snapshots_portfolio_idx';
"
```

预期: 第一个返回 1 行(表本身);
第二个返回 1 行(索引存在)。

- [ ] **Step 4: 提交**

```bash
git add supabase/migrations/006_risk_schema.sql
git commit -m "feat(db): portfolio_equity_snapshots table for risk peak tracking"
```

---

## Task 2: lib/risk/types.ts

**Files:**
- Create: `src/lib/risk/types.ts`

- [ ] **Step 1: 实现 types.ts**

`src/lib/risk/types.ts`:

```ts
import type {
  Portfolio,
  Position,
  RebalanceIntent,
  RebalancePlan,
} from '@/lib/trading'

/** 规则求值后的决策(沿用 spec §6.6) */
export type RiskAction =
  | { kind: 'allow' }
  | { kind: 'modify'; changes: RebalanceIntent[]; reasonCode: string }
  | { kind: 'reject'; reasonCode: string; reasonParams?: Record<string, unknown> }
  | { kind: 'stop'; reasonCode: string; reasonParams?: Record<string, unknown> }

/** 规则的输入上下文(由 riskEngine 准备) */
export interface RiskContext {
  /** 当前 portfolio(只读) */
  portfolio: Portfolio
  /** 当前持仓(只读) */
  positions: Position[]
  /** 持仓按 symbol 索引 */
  positionsBySymbol: Map<string, Position>
  /** 现金(从 portfolio.cash 复制一份方便 modify) */
  cash: number
  /** 总权益 = cash + Σ(shares × lastClose) */
  equity: number
  /** 历史 peak equity(MAX(equity_snapshots.equity) + 当前 equity) */
  peakEquity: number
  /** 当日 trade_date(YYYY-MM-DD) */
  today: string
  /** 当前规则之前的 modify 累计(允许链条 modify) */
  appliedModifies: RebalanceIntent[]
}

/** 单条规则接口 */
export interface RiskRule {
  /** 规则的稳定 id(供 i18n / 日志引用) */
  id:
    | 'INSUFFICIENT_BUYING_POWER'
    | 'INSUFFICIENT_SELLABLE_SHARES'
    | 'MAX_POSITION_PCT'
    | 'MAX_POSITIONS'
    | 'MAX_TOTAL_EXPOSURE'
    | 'MAX_DRAWDOWN_STOP'
  /** 求值 */
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction
}

/** 引擎一次求值的结果(给 strategy_run_log 记录) */
export interface RiskDecisionLog {
  ruleId: RiskRule['id']
  action: RiskAction['kind']
  reasonCode: string | null
  at: string  // ISO 时间
}

/** 引擎总结果 */
export interface RiskEvaluationResult {
  /** 最终 plan.intents(modify 链全部应用后) */
  finalIntents: RebalanceIntent[]
  /** 是否触发 stop */
  stopped: boolean
  /** stop 的 reasonCode(若 stopped=true) */
  stopReasonCode: string | null
  /** 每条规则的执行日志(供 UI 显示与日志分析) */
  log: RiskDecisionLog[]
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS(注意:需要 Phase 3 的 `trading/index.ts` 已经 export `RebalanceIntent` / `RebalancePlan`)。

- [ ] **Step 3: 提交**

```bash
git add src/lib/risk/types.ts
git commit -m "feat(risk): shared types for rules / engine / context"
```

---

## Task 3: lib/risk/messages.ts — i18n 错误码 + 双语文案

**Files:**
- Create: `src/lib/risk/messages.ts`

- [ ] **Step 1: 实现 messages.ts**

`src/lib/risk/messages.ts`:

```ts
/**
 * 风控规则的 i18n 文案(供 UI 与 cron 日志复用)。
 * key 与 RiskReasonCode 一一对应。
 */
export interface RiskMessage {
  /** en */
  en: string
  /** zh */
  zh: string
}

export const RISK_MESSAGES: Record<string, RiskMessage> = {
  INSUFFICIENT_BUYING_POWER: {
    en: 'Not enough cash to place this order',
    zh: '可用资金不足,无法下单',
  },
  INSUFFICIENT_SELLABLE_SHARES: {
    en: 'Insufficient sellable shares (T+1 lock)',
    zh: '可卖股数不足(T+1 解禁未到)',
  },
  MAX_POSITION_PCT: {
    en: 'Single position would exceed {pct}% of equity',
    zh: '单仓位超过权益的 {pct}%',
  },
  MAX_POSITIONS: {
    en: 'Number of positions {count} exceeds limit {limit}',
    zh: '持仓数 {count} 超过上限 {limit}',
  },
  MAX_TOTAL_EXPOSURE: {
    en: 'Total exposure would exceed {pct}% of equity',
    zh: '总仓位超过权益的 {pct}%',
  },
  MAX_DRAWDOWN_STOP: {
    en: 'Drawdown {pct}% breached limit {limit}%, strategy stopped',
    zh: '回撤 {pct}% 超过止损 {limit}%,策略已停止',
  },
}

/** 渲染消息(把 {key} 替换成 params) */
export function renderRiskMessage(
  code: string,
  locale: 'en' | 'zh',
  params: Record<string, string | number> = {},
): string {
  const m = RISK_MESSAGES[code]?.[locale] ?? code
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    m,
  )
}
```

- [ ] **Step 2: 写失败测试**

`src/lib/risk/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderRiskMessage, RISK_MESSAGES } from './messages'

describe('renderRiskMessage', () => {
  it('returns English message when locale=en', () => {
    const out = renderRiskMessage('INSUFFICIENT_BUYING_POWER', 'en')
    expect(out).toBe('Not enough cash to place this order')
  })

  it('returns Chinese message when locale=zh', () => {
    const out = renderRiskMessage('INSUFFICIENT_BUYING_POWER', 'zh')
    expect(out).toBe('可用资金不足,无法下单')
  })

  it('substitutes {pct} placeholder', () => {
    const out = renderRiskMessage('MAX_POSITION_PCT', 'en', { pct: 25 })
    expect(out).toBe('Single position would exceed 25% of equity')
  })

  it('substitutes multiple placeholders', () => {
    const out = renderRiskMessage('MAX_POSITIONS', 'zh', { count: 8, limit: 5 })
    expect(out).toBe('持仓数 8 超过上限 5')
  })

  it('falls back to code when unknown', () => {
    expect(renderRiskMessage('UNKNOWN_RULE', 'en')).toBe('UNKNOWN_RULE')
  })

  it('has both en and zh for all known codes', () => {
    for (const code of Object.keys(RISK_MESSAGES)) {
      expect(RISK_MESSAGES[code].en).toBeTruthy()
      expect(RISK_MESSAGES[code].zh).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: 运行测试确认通过**

```bash
pnpm test src/lib/risk/messages.test.ts
```

预期: PASS, 6 tests。

- [ ] **Step 4: 提交**

```bash
git add src/lib/risk/messages.ts src/lib/risk/messages.test.ts
git commit -m "feat(risk): i18n messages + renderRiskMessage"
```

---

## Task 4: lib/risk/peak.ts — peak equity 查询

**Files:**
- Create: `src/lib/risk/peak.ts`
- Create: `src/lib/risk/peak.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/risk/peak.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computePeakEquity } from './peak'
import type { Portfolio, EquitySnapshot } from '@/lib/trading'

function mkPortfolio(equity: number, cash: number): Portfolio {
  return {
    id: 'p1', userId: 'u1', strategyId: 's1',
    cash, initialCash: 1_000_000, status: 'active',
    stopReason: null, startedAt: '2026-09-01T00:00:00Z', stoppedAt: null,
  }
  // 注意:Portfolio 类型不带 equity;由调用方传 equityInPortfolio 进去
}

function mkSnap(date: string, equity: number): EquitySnapshot {
  return {
    id: `s-${date}`, userId: 'u1', portfolioId: 'p1',
    tradeDate: date, equity, cash: equity, marketValue: 0,
    recordedAt: `${date}T15:10:00Z`,
  }
}

describe('computePeakEquity', () => {
  it('returns current equity when no snapshots', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(950_000, 950_000),
      currentEquity: 950_000,
      snapshots: [],
    })
    expect(peak).toBe(950_000)
  })

  it('returns MAX(snapshot.equity, currentEquity)', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(900_000, 900_000),
      currentEquity: 900_000,
      snapshots: [mkSnap('2026-09-10', 1_050_000), mkSnap('2026-09-12', 1_100_000)],
    })
    expect(peak).toBe(1_100_000)
  })

  it('currentEquity wins when higher than all snapshots', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(1_200_000, 1_200_000),
      currentEquity: 1_200_000,
      snapshots: [mkSnap('2026-09-10', 1_100_000)],
    })
    expect(peak).toBe(1_200_000)
  })

  it('returns 0 when both are 0 (defensive)', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(0, 0),
      currentEquity: 0,
      snapshots: [],
    })
    expect(peak).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/risk/peak.test.ts
```

预期: FAIL — `Cannot find module './peak'` 和 `Cannot find module '@/lib/trading'`(后者需要补 type export)。

- [ ] **Step 3: 在 trading/types.ts 加 EquitySnapshot 类型**

修改 `src/lib/trading/types.ts`,在 `StrategyRunLogEntry` 之后插入:

```ts
/** 组合每日权益快照 */
export interface EquitySnapshot {
  id: string
  userId: string
  portfolioId: string
  tradeDate: string
  equity: number
  cash: number
  marketValue: number
  recordedAt: string
}
```

- [ ] **Step 4: 在 trading/index.ts 导出 EquitySnapshot**

修改 `src/lib/trading/index.ts`,在 `export type { ... } from './types'` 块中加入 `EquitySnapshot`:

```ts
export type {
  Order,
  OrderRequest,
  OrderSide,
  OrderStatus,
  Position,
  Fill,
  Portfolio,
  EquitySnapshot,
  StrategyRunLogEntry,
  SettleResult,
} from './types'
```

- [ ] **Step 5: 实现 peak.ts**

`src/lib/risk/peak.ts`:

```ts
import type { EquitySnapshot, Portfolio } from '@/lib/trading'

/** peak.ts 的输入 */
export interface ComputePeakEquityInput {
  portfolio: Portfolio
  /** 当前权益(实时计算:cash + Σ(shares × lastClose)) */
  currentEquity: number
  /** 历史 snapshot 列表(已按 trade_date DESC 排序,或任意顺序) */
  snapshots: EquitySnapshot[]
}

/**
 * 计算 peak equity:
 *   peak = MAX(MAX(snapshots.equity), currentEquity)
 *
 * 用于 MAX_DRAWDOWN_STOP 规则:回撤 = (currentEquity - peak) / peak。
 */
export function computePeakEquity(input: ComputePeakEquityInput): number {
  const { currentEquity, snapshots } = input
  let peak = currentEquity
  for (const s of snapshots) {
    if (s.equity > peak) peak = s.equity
  }
  return peak
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm test src/lib/risk/peak.test.ts
```

预期: PASS, 4 tests。

- [ ] **Step 7: 提交**

```bash
git add src/lib/trisk/peak.ts src/lib/risk/peak.test.ts src/lib/trading/types.ts src/lib/trading/index.ts
git commit -m "feat(risk): computePeakEquity + EquitySnapshot type"
```

---

## Task 5: lib/risk/rules.ts — 6 条规则(TDD)

**Files:**
- Create: `src/lib/risk/rules.ts`
- Create: `src/lib/risk/rules.test.ts`

> 一个文件 6 条规则,每条规则配一段 `describe` + 多个 it。TDD 流程:先把 6 个 describe 全写出来跑(全部 FAIL),再一段一段实现让对应 describe 通过。

- [ ] **Step 1: 写失败测试(全部 6 条规则)**

`src/lib/risk/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
} from './rules'
import type { RiskContext } from './types'
import type { RebalancePlan, RebalanceIntent, Portfolio, Position } from '@/lib/trading'

function mkPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1', userId: 'u1', strategyId: 's1',
    cash: 1_000_000, initialCash: 1_000_000, status: 'active',
    stopReason: null, startedAt: '2026-09-01T00:00:00Z', stoppedAt: null,
    ...overrides,
  }
}

function mkPos(symbol: string, shares: number, available = shares): Position {
  return {
    id: `pos-${symbol}`, userId: 'u1', portfolioId: 'p1',
    symbolCode: symbol, shares, availableShares: available,
    costPrice: 10, updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkCtx(overrides: Partial<RiskContext> = {}): RiskContext {
  const positions = overrides.positions ?? []
  return {
    portfolio: overrides.portfolio ?? mkPortfolio(),
    positions,
    positionsBySymbol: new Map(positions.map((p) => [p.symbolCode, p])),
    cash: overrides.cash ?? 1_000_000,
    equity: overrides.equity ?? 1_000_000,
    peakEquity: overrides.peakEquity ?? 1_000_000,
    today: overrides.today ?? '2026-09-15',
    appliedModifies: overrides.appliedModifies ?? [],
  }
}

function mkIntent(symbol: string, side: 'BUY' | 'SELL', shares: number, price: number): RebalanceIntent {
  return { symbolCode: symbol, side, shares, intendedPrice: price, targetAmount: shares * price }
}

function mkPlan(intents: RebalanceIntent[]): RebalancePlan {
  return { intents }
}

// ====== INSUFFICIENT_BUYING_POWER ======
describe('insufficientBuyingPowerRule', () => {
  it('allows when cash covers all BUY intents', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 1000, 10)]) // 10000
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 1_000_000 }))
    expect(r.kind).toBe('allow')
  })

  it('rejects single BUY intent exceeding cash', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 200_000, 10)]) // 2_000_000
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 1_000_000 }))
    expect(r.kind).toBe('reject')
    if (r.kind === 'reject') expect(r.reasonCode).toBe('INSUFFICIENT_BUYING_POWER')
  })

  it('ignores SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1000, 10)])
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 0 }))
    expect(r.kind).toBe('allow')
  })

  it('returns first failure as reject', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100, 10),       // OK
      mkIntent('600001', 'BUY', 200_000, 10),  // FAIL
    ])
    const r = insufficientBuyingPowerRule.evaluate(plan, mkCtx({ cash: 5000 }))
    expect(r.kind).toBe('reject')
  })
})

// ====== INSUFFICIENT_SELLABLE_SHARES ======
describe('insufficientSellableSharesRule', () => {
  it('allows SELL within availableShares', () => {
    const positions = [mkPos('600000', 1000, 1000)]
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ positions }))
    expect(r.kind).toBe('allow')
  })

  it('rejects SELL exceeding availableShares', () => {
    const positions = [mkPos('600000', 1000, 0)] // T+1 锁定
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ positions }))
    expect(r.kind).toBe('reject')
  })

  it('rejects SELL with no position at all', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 500, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ positions: [] }))
    expect(r.kind).toBe('reject')
  })

  it('ignores BUY intents', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100_000, 10)])
    const r = insufficientSellableSharesRule.evaluate(plan, mkCtx({ cash: 0 }))
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_POSITION_PCT ======
describe('maxPositionPctRule', () => {
  it('allows when BUY within limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 10_000, 10)]) // 100_000 = 10% of 1_000_000
    const r = maxPositionPctRule.evaluate(plan, mkCtx({ equity: 1_000_000 }), 20)
    expect(r.kind).toBe('allow')
  })

  it('modifies BUY to cap at limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 30_000, 10)]) // 300_000 = 30%
    const r = maxPositionPctRule.evaluate(plan, mkCtx({ equity: 1_000_000 }), 20)
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // limit 20% of 1_000_000 = 200_000 → shares = 200_000 / 10 = 20_000
      expect(r.changes[0].shares).toBe(20_000)
    }
  })

  it('rounds shares to integer (floor)', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100_000, 10.01)]) // targetAmount = 1_001_000
    const r = maxPositionPctRule.evaluate(plan, mkCtx({ equity: 1_000_000 }), 20)
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // limit 200_000 → shares = floor(200_000 / 10.01) = 19_980
      expect(r.changes[0].shares).toBe(19_980)
    }
  })

  it('skips SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1000, 10)])
    const r = maxPositionPctRule.evaluate(plan, mkCtx(), 5)
    expect(r.kind).toBe('allow')
  })

  it('drops BUY entirely when limit below 1 share', () => {
    // 0.5% of 1_000_000 = 5_000 → floor(5000 / 10) = 500 shares;但如果 intendedPrice 很高?
    const plan = mkPlan([mkIntent('600000', 'BUY', 1000, 10_000)]) // 10_000_000
    const r = maxPositionPctRule.evaluate(plan, mkCtx({ equity: 1_000 }), 10) // limit = 100
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      // 100 / 10_000 = 0.01 → floor = 0 → 0 shares
      expect(r.changes[0].shares).toBe(0)
    }
  })
})

// ====== MAX_POSITIONS ======
describe('maxPositionsRule', () => {
  it('allows when positions count within limit', () => {
    const plan = mkPlan([mkIntent('600000', 'BUY', 100, 10)])
    const r = maxPositionsRule.evaluate(plan, mkCtx(), 5)
    expect(r.kind).toBe('allow')
  })

  it('rejects when new positions would exceed limit', () => {
    // 已持仓 3 笔,新 plan 还要买 5 笔 → 总 8 > 5
    const positions = [
      mkPos('600010', 100),
      mkPos('600011', 100),
      mkPos('600012', 100),
    ]
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100, 10),
      mkIntent('600001', 'BUY', 100, 10),
    ])
    const r = maxPositionsRule.evaluate(plan, mkCtx({ positions }), 5)
    expect(r.kind).toBe('reject')
    if (r.kind === 'reject') {
      expect(r.reasonParams).toMatchObject({ count: 5, limit: 5 })
    }
  })

  it('allows SELL of existing position (no new position added)', () => {
    const positions = [mkPos('600000', 100)]
    const plan = mkPlan([mkIntent('600000', 'SELL', 100, 10)])
    const r = maxPositionsRule.evaluate(plan, mkCtx({ positions }), 1)
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_TOTAL_EXPOSURE ======
describe('maxTotalExposureRule', () => {
  it('allows when total BUY within limit', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 1000, 10),  // 10_000
      mkIntent('600001', 'BUY', 2000, 10),  // 20_000
    ])
    const r = maxTotalExposureRule.evaluate(plan, mkCtx({ equity: 1_000_000 }), 10)
    expect(r.kind).toBe('allow')
  })

  it('modifies to cap total BUY amount at limit', () => {
    const plan = mkPlan([
      mkIntent('600000', 'BUY', 100_000, 10),  // 1_000_000
      mkIntent('600001', 'BUY', 50_000, 10),   // 500_000
    ])
    // limit 100% → 1_000_000 → 等比缩放:600000 → 666_666, 600001 → 333_333
    const r = maxTotalExposureRule.evaluate(plan, mkCtx({ equity: 1_000_000 }), 100)
    expect(r.kind).toBe('modify')
    if (r.kind === 'modify') {
      const total = r.changes.reduce((sum, c) => sum + c.targetAmount, 0)
      expect(total).toBeCloseTo(1_000_000, 0)
    }
  })

  it('ignores SELL intents', () => {
    const plan = mkPlan([mkIntent('600000', 'SELL', 1_000_000, 10)])
    const r = maxTotalExposureRule.evaluate(plan, mkCtx(), 1)
    expect(r.kind).toBe('allow')
  })
})

// ====== MAX_DRAWDOWN_STOP ======
describe('maxDrawdownStopRule', () => {
  it('allows when drawdown within limit', () => {
    // peak 1_000_000, current 950_000 → drawdown = 5%, limit = 10%
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 950_000, peakEquity: 1_000_000 }),
      10,
    )
    expect(r.kind).toBe('allow')
  })

  it('stops when drawdown exceeds limit', () => {
    // peak 1_000_000, current 940_000 → drawdown = 6%, limit = 5%
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 940_000, peakEquity: 1_000_000 }),
      5,
    )
    expect(r.kind).toBe('stop')
    if (r.kind === 'stop') {
      expect(r.reasonCode).toBe('MAX_DRAWDOWN_STOP')
      expect(r.reasonParams).toMatchObject({ pct: 6, limit: 5 })
    }
  })

  it('stops at exact boundary (>= limit)', () => {
    // peak 1_000_000, current 950_000 → drawdown = 5%, limit = 5%
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 950_000, peakEquity: 1_000_000 }),
      5,
    )
    expect(r.kind).toBe('stop')
  })

  it('allows when peakEquity is 0 (no history, defensive)', () => {
    const r = maxDrawdownStopRule.evaluate(
      mkPlan([]),
      mkCtx({ equity: 1_000_000, peakEquity: 0 }),
      5,
    )
    expect(r.kind).toBe('allow')
  })
})
```

- [ ] **Step 2: 运行测试确认全部失败**

```bash
pnpm test src/lib/risk/rules.test.ts
```

预期: FAIL — `Cannot find module './rules'`。

- [ ] **Step 3: 实现 rules.ts(6 条规则)**

`src/lib/risk/rules.ts`:

```ts
import type { RiskContext, RiskRule, RiskAction } from './types'
import type { RebalanceIntent, RebalancePlan } from '@/lib/trading'

// ============================================================
// INSUFFICIENT_BUYING_POWER
// ============================================================
/** 校验所有 BUY intent 的 targetAmount 之和 ≤ cash。 */
export const insufficientBuyingPowerRule: RiskRule = {
  id: 'INSUFFICIENT_BUYING_POWER',
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction {
    let usedCash = 0
    for (const i of plan.intents) {
      if (i.side !== 'BUY') continue
      usedCash += i.targetAmount
      if (usedCash > ctx.cash) {
        return { kind: 'reject', reasonCode: 'INSUFFICIENT_BUYING_POWER' }
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// INSUFFICIENT_SELLABLE_SHARES
// ============================================================
/** 校验所有 SELL intent 的 shares ≤ position.availableShares。 */
export const insufficientSellableSharesRule: RiskRule = {
  id: 'INSUFFICIENT_SELLABLE_SHARES',
  evaluate(plan: RebalancePlan, ctx: RiskContext): RiskAction {
    for (const i of plan.intents) {
      if (i.side !== 'SELL') continue
      const pos = ctx.positionsBySymbol.get(i.symbolCode)
      const available = pos?.availableShares ?? 0
      if (i.shares > available) {
        return {
          kind: 'reject',
          reasonCode: 'INSUFFICIENT_SELLABLE_SHARES',
          reasonParams: { symbolCode: i.symbolCode, requested: i.shares, available },
        }
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// MAX_POSITION_PCT (modify)
// ============================================================
/** 单仓位 BUY 金额 ≤ equity × limitPct。超出的 BUY 缩到 limit(整数股,向下取整)。 */
export const maxPositionPctRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_POSITION_PCT',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    const cap = ctx.equity * (limitPct / 100)
    let changed = false
    const changes: RebalanceIntent[] = plan.intents.map((i) => {
      if (i.side !== 'BUY') return i
      if (i.targetAmount <= cap) return i
      changed = true
      const newShares = Math.floor(cap / i.intendedPrice)
      return { ...i, shares: newShares, targetAmount: newShares * i.intendedPrice }
    })
    return changed
      ? { kind: 'modify', changes, reasonCode: 'MAX_POSITION_PCT' }
      : { kind: 'allow' }
  },
}

// ============================================================
// MAX_POSITIONS (reject)
// ============================================================
/** 已持仓 + 新 BUY intent 中不同 symbol 数 > limit → reject。
 *  本期:不裁剪,直接 reject(简化)。SELL 不算新仓位。 */
export const maxPositionsRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limit: number): RiskAction
} = {
  id: 'MAX_POSITIONS',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limit: number): RiskAction {
    const existingSymbols = new Set(ctx.positions.map((p) => p.symbolCode))
    const newBuySymbols = new Set<string>()
    for (const i of plan.intents) {
      if (i.side === 'BUY') newBuySymbols.add(i.symbolCode)
    }
    const totalAfter = new Set([...existingSymbols, ...newBuySymbols]).size
    if (totalAfter > limit) {
      return {
        kind: 'reject',
        reasonCode: 'MAX_POSITIONS',
        reasonParams: { count: totalAfter, limit },
      }
    }
    return { kind: 'allow' }
  },
}

// ============================================================
// MAX_TOTAL_EXPOSURE (modify)
// ============================================================
/** 所有 BUY amount 之和 ≤ equity × limitPct。超出则等比缩放。 */
export const maxTotalExposureRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_TOTAL_EXPOSURE',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    const buys = plan.intents.filter((i) => i.side === 'BUY')
    if (buys.length === 0) return { kind: 'allow' }
    const totalAmount = buys.reduce((sum, i) => sum + i.targetAmount, 0)
    const cap = ctx.equity * (limitPct / 100)
    if (totalAmount <= cap) return { kind: 'allow' }
    const scale = cap / totalAmount
    const changes: RebalanceIntent[] = plan.intents.map((i) => {
      if (i.side !== 'BUY') return i
      const newShares = Math.floor(i.shares * scale)
      return {
        ...i,
        shares: newShares,
        targetAmount: newShares * i.intendedPrice,
      }
    })
    return { kind: 'modify', changes, reasonCode: 'MAX_TOTAL_EXPOSURE' }
  },
}

// ============================================================
// MAX_DRAWDOWN_STOP (stop)
// ============================================================
/** (currentEquity - peakEquity) / peakEquity < -limitPct → stop。 */
export const maxDrawdownStopRule: RiskRule & {
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction
} = {
  id: 'MAX_DRAWDOWN_STOP',
  evaluate(plan: RebalancePlan, ctx: RiskContext, limitPct: number): RiskAction {
    if (ctx.peakEquity <= 0) return { kind: 'allow' }
    const drawdownPct = ((ctx.equity - ctx.peakEquity) / ctx.peakEquity) * 100
    if (drawdownPct <= -limitPct) {
      return {
        kind: 'stop',
        reasonCode: 'MAX_DRAWDOWN_STOP',
        reasonParams: {
          pct: Math.round(-drawdownPct * 100) / 100,
          limit: limitPct,
        },
      }
    }
    return { kind: 'allow' }
  },
}

/** 6 条规则的导出数组(供 riskEngine 使用) */
export const ALL_RULES = [
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
] as const
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/risk/rules.test.ts
```

预期: PASS,约 23 tests(6 个 describe)。

- [ ] **Step 5: 提交**

```bash
git add src/lib/risk/rules.ts src/lib/risk/rules.test.ts
git commit -m "feat(risk): 6 rules (buying_power / sellable / position_pct / max_positions / exposure / drawdown)"
```

---

## Task 6: lib/risk/engine.ts — 规则引擎

**Files:**
- Create: `src/lib/risk/engine.ts`
- Create: `src/lib/risk/engine.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/risk/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateRisk } from './engine'
import type { RiskContext } from './types'
import type { RebalancePlan, RebalanceIntent, Portfolio, Position, StrategySpec } from '@/lib/trading'

function mkPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1', userId: 'u1', strategyId: 's1',
    cash: 1_000_000, initialCash: 1_000_000, status: 'active',
    stopReason: null, startedAt: '2026-09-01T00:00:00Z', stoppedAt: null,
    ...overrides,
  }
}

function mkPos(symbol: string, shares: number, available = shares): Position {
  return {
    id: `pos-${symbol}`, userId: 'u1', portfolioId: 'p1',
    symbolCode: symbol, shares, availableShares: available,
    costPrice: 10, updatedAt: '2026-09-15T00:00:00Z',
  }
}

function mkIntent(symbol: string, side: 'BUY' | 'SELL', shares: number, price: number): RebalanceIntent {
  return { symbolCode: symbol, side, shares, intendedPrice: price, targetAmount: shares * price }
}

function mkCtx(overrides: Partial<RiskContext> = {}): RiskContext {
  const positions = overrides.positions ?? []
  return {
    portfolio: overrides.portfolio ?? mkPortfolio(),
    positions,
    positionsBySymbol: new Map(positions.map((p) => [p.symbolCode, p])),
    cash: overrides.cash ?? 1_000_000,
    equity: overrides.equity ?? 1_000_000,
    peakEquity: overrides.peakEquity ?? 1_000_000,
    today: overrides.today ?? '2026-09-15',
    appliedModifies: overrides.appliedModifies ?? [],
  }
}

const baseSpec: StrategySpec = {
  entry: { combinator: 'AND', conditions: [] },
  exit: { combinator: 'OR', conditions: [] },
  holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 },
}

describe('evaluateRisk', () => {
  it('returns finalIntents unchanged when all rules allow', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1000, 10)] }
    const r = evaluateRisk({ plan, ctx: mkCtx({ cash: 1_000_000 }), spec: baseSpec })
    expect(r.stopped).toBe(false)
    expect(r.finalIntents).toEqual(plan.intents)
    expect(r.log.length).toBe(6) // 6 rules
    expect(r.log.every((l) => l.action === 'allow')).toBe(true)
  })

  it('chains modify: positionPct caps single share, then exposure caps total', () => {
    const plan: RebalancePlan = {
      intents: [
        mkIntent('600000', 'BUY', 100_000, 10), // 1_000_000 (over 25%)
        mkIntent('600001', 'BUY', 100_000, 10), // 1_000_000
      ],
    }
    const r = evaluateRisk({ plan, ctx: mkCtx({ cash: 10_000_000, equity: 1_000_000 }), spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 } } })
    expect(r.stopped).toBe(false)
    // positionPct: 每笔 25% × 1_000_000 = 250_000 / 10 = 25_000 shares
    // exposure (100% by default): 不限(默认 limit 100%);totalAmount 仍是 500_000
    expect(r.finalIntents[0].shares).toBe(25_000)
    expect(r.finalIntents[1].shares).toBe(25_000)
    expect(r.log.some((l) => l.action === 'modify' && l.reasonCode === 'MAX_POSITION_PCT')).toBe(true)
  })

  it('short-circuits on first reject and skips subsequent rules', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1_000_000, 10)] }
    const r = evaluateRisk({ plan, ctx: mkCtx({ cash: 100 }), spec: baseSpec })
    expect(r.stopped).toBe(false)
    expect(r.finalIntents).toEqual(plan.intents) // reject 不改 plan
    expect(r.log.some((l) => l.action === 'reject')).toBe(true)
  })

  it('short-circuits on stop and returns unmodified plan', () => {
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 1000, 10)] }
    const r = evaluateRisk({
      plan,
      ctx: mkCtx({ equity: 800_000, peakEquity: 1_000_000 }), // drawdown 20%
      spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 25, maxDrawdownPct: 10 } },
    })
    expect(r.stopped).toBe(true)
    expect(r.stopReasonCode).toBe('MAX_DRAWDOWN_STOP')
    // stop 后引擎不再跑后续规则,但 finalIntents 仍为 plan(给上层"丢弃全部"信号)
    expect(r.log[0].action).toBe('allow')
    expect(r.log.some((l) => l.action === 'stop')).toBe(true)
  })

  it('applies each modify with the updated plan (chained)', () => {
    // positionPct 改后,后续规则看到的是改过的 plan
    const plan: RebalancePlan = { intents: [mkIntent('600000', 'BUY', 30_000, 10)] }
    const r = evaluateRisk({
      plan,
      ctx: mkCtx({ cash: 1_000_000, equity: 1_000_000 }),
      spec: { ...baseSpec, holding: { maxPositions: 5, positionSizePct: 10, maxDrawdownPct: 50 } },
    })
    // 10% cap → 100_000 → 10_000 shares
    expect(r.finalIntents[0].shares).toBe(10_000)
    expect(r.log.filter((l) => l.action === 'modify').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/risk/engine.test.ts
```

预期: FAIL — `Cannot find module './engine'`。

- [ ] **Step 3: 实现 engine.ts**

`src/lib/risk/engine.ts`:

```ts
import {
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
} from './rules'
import type { RiskContext, RiskDecisionLog, RiskEvaluationResult } from './types'
import type { RebalancePlan, RebalanceIntent, StrategySpec } from '@/lib/trading'

export interface EvaluateRiskInput {
  plan: RebalancePlan
  ctx: RiskContext
  spec: StrategySpec
}

/**
 * 顺序求值规则,带短路:
 *   1. INSUFFICIENT_BUYING_POWER
 *   2. INSUFFICIENT_SELLABLE_SHARES
 *   3. MAX_POSITION_PCT (modify)
 *   4. MAX_POSITIONS
 *   5. MAX_TOTAL_EXPOSURE (modify)
 *   6. MAX_DRAWDOWN_STOP (stop)
 *
 * modify 链:每条规则的 modify 都基于上一条的 finalIntents 计算。
 * reject:跳过剩余规则,finalIntents 保持 reject 之前的值(给上层"丢弃全部"信号)。
 * stop:同上,但 stopped=true。
 */
export function evaluateRisk(input: EvaluateRiskInput): RiskEvaluationResult {
  const { plan, ctx, spec } = input
  const { maxPositions, positionSizePct, maxDrawdownPct } = spec.holding

  let currentIntents: RebalanceIntent[] = plan.intents
  const log: RiskDecisionLog[] = []
  const now = new Date().toISOString()

  function record(action: RiskDecisionLog['action'], ruleId: string, reasonCode: string | null) {
    log.push({ ruleId: ruleId as RiskDecisionLog['ruleId'], action, reasonCode, at: now })
  }

  // 1. INSUFFICIENT_BUYING_POWER
  let r = insufficientBuyingPowerRule.evaluate({ intents: currentIntents }, ctx)
  record(r.kind, 'INSUFFICIENT_BUYING_POWER', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)
  if (r.kind === 'reject') return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 2. INSUFFICIENT_SELLABLE_SHARES
  r = insufficientSellableSharesRule.evaluate({ intents: currentIntents }, ctx)
  record(r.kind, 'INSUFFICIENT_SELLABLE_SHARES', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)
  if (r.kind === 'reject') return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 3. MAX_POSITION_PCT (modify)
  r = maxPositionPctRule.evaluate({ intents: currentIntents }, ctx, positionSizePct)
  record(r.kind, 'MAX_POSITION_PCT', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)
  if (r.kind === 'modify') currentIntents = r.changes
  if (r.kind === 'reject') return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 4. MAX_POSITIONS
  r = maxPositionsRule.evaluate({ intents: currentIntents }, ctx, maxPositions)
  record(r.kind, 'MAX_POSITIONS', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)
  if (r.kind === 'reject') return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 5. MAX_TOTAL_EXPOSURE (modify)
  r = maxTotalExposureRule.evaluate({ intents: currentIntents }, ctx, 100)
  record(r.kind, 'MAX_TOTAL_EXPOSURE', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)
  if (r.kind === 'modify') currentIntents = r.changes
  if (r.kind === 'reject') return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }

  // 6. MAX_DRAWDOWN_STOP (stop)
  r = maxDrawdownStopRule.evaluate({ intents: currentIntents }, ctx, maxDrawdownPct)
  if (r.kind === 'stop') {
    record('stop', 'MAX_DRAWDOWN_STOP', r.reasonCode)
    return { finalIntents: currentIntents, stopped: true, stopReasonCode: r.reasonCode, log }
  }
  record(r.kind, 'MAX_DRAWDOWN_STOP', r.kind === 'allow' ? null : (r as { reasonCode: string }).reasonCode)

  return { finalIntents: currentIntents, stopped: false, stopReasonCode: null, log }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/risk/engine.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/risk/engine.ts src/lib/risk/engine.test.ts
git commit -m "feat(risk): sequential rule engine with short-circuit"
```

---

## Task 7: lib/risk/equity-snapshot.ts — 写入 + 查询 snapshot

**Files:**
- Create: `src/lib/risk/equity-snapshot.ts`
- Create: `src/lib/risk/equity-snapshot.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/risk/equity-snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeEquityFromPortfolio, snapshotKey } from './equity-snapshot'

describe('snapshotKey', () => {
  it('produces stable key for portfolio + date', () => {
    expect(snapshotKey('p1', '2026-09-15')).toBe('p1|2026-09-15')
  })
})

describe('computeEquityFromPortfolio', () => {
  it('returns cash when no positions', () => {
    const e = computeEquityFromPortfolio({
      cash: 1_000_000,
      positions: [],
      lastCloseBySymbol: new Map(),
    })
    expect(e).toBe(1_000_000)
  })

  it('sums cash + shares × lastClose', () => {
    const e = computeEquityFromPortfolio({
      cash: 500_000,
      positions: [
        { symbolCode: '600000', shares: 1000 },
        { symbolCode: '600001', shares: 2000 },
      ],
      lastCloseBySymbol: new Map([
        ['600000', 10],
        ['600001', 20],
      ]),
    })
    // 500_000 + 1000×10 + 2000×20 = 500_000 + 10_000 + 40_000 = 550_000
    expect(e).toBe(550_000)
  })

  it('skips positions missing lastClose (defensive, treats as 0)', () => {
    const e = computeEquityFromPortfolio({
      cash: 100_000,
      positions: [{ symbolCode: '600000', shares: 1000 }],
      lastCloseBySymbol: new Map(), // 没 close
    })
    expect(e).toBe(100_000)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/risk/equity-snapshot.test.ts
```

预期: FAIL — `Cannot find module './equity-snapshot'`。

- [ ] **Step 3: 实现 equity-snapshot.ts**

`src/lib/risk/equity-snapshot.ts`:

```ts
import type { EquitySnapshot, Position } from '@/lib/trading'

/** snapshot 唯一键:portfolio + trade_date */
export function snapshotKey(portfolioId: string, tradeDate: string): string {
  return `${portfolioId}|${tradeDate}`
}

/** 计算 equity = cash + Σ(shares × lastClose) */
export function computeEquityFromPortfolio(input: {
  cash: number
  positions: Pick<Position, 'symbolCode' | 'shares'>[]
  lastCloseBySymbol: Map<string, number>
}): number {
  let marketValue = 0
  for (const p of input.positions) {
    const close = input.lastCloseBySymbol.get(p.symbolCode)
    if (close !== undefined) marketValue += p.shares * close
  }
  return input.cash + marketValue
}

/** EquitySnapshot upsert 入参(给 service-role helper 调用) */
export interface UpsertEquitySnapshotInput {
  userId: string
  portfolioId: string
  tradeDate: string
  equity: number
  cash: number
  marketValue: number
}

/**
 * 序列化为 Supabase 行(供上层 query.ts 用)。
 * 本函数纯数据转换,不直接做 IO;IO 在 query.ts 里。
 */
export function toDbEquitySnapshotRow(input: UpsertEquitySnapshotInput) {
  return {
    user_id: input.userId,
    portfolio_id: input.portfolioId,
    trade_date: input.tradeDate,
    equity: input.equity,
    cash: input.cash,
    market_value: input.marketValue,
  }
}

export function fromDbEquitySnapshotRow(row: {
  id: string
  user_id: string
  portfolio_id: string
  trade_date: string
  equity: string | number
  cash: string | number
  market_value: string | number
  recorded_at: string
}): EquitySnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    portfolioId: row.portfolio_id,
    tradeDate: row.trade_date,
    equity: Number(row.equity),
    cash: Number(row.cash),
    marketValue: Number(row.market_value),
    recordedAt: row.recorded_at,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/risk/equity-snapshot.test.ts
```

预期: PASS, 4 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/risk/equity-snapshot.ts src/lib/risk/equity-snapshot.test.ts
git commit -m "feat(risk): equity computation + snapshot row converters"
```

---

## Task 8: lib/risk/query.ts — RLS + service-role helpers

**Files:**
- Create: `src/lib/risk/query.ts`

- [ ] **Step 1: 实现 query.ts**

`src/lib/risk/query.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { EquitySnapshot } from '@/lib/trading/types'
import { fromDbEquitySnapshotRow, toDbEquitySnapshotRow } from './equity-snapshot'

// ============ RLS helpers(用户读自己的) ============

export async function listSnapshotsByPortfolio(
  portfolioId: string,
  limit = 90,
): Promise<EquitySnapshot[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolio_equity_snapshots')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listSnapshotsByPortfolio failed: ${error.message}`)
  return (data ?? []).map(fromDbEquitySnapshotRow)
}

// ============ Service-role helpers(cron 使用) ============

/** upsert 一行 snapshot;唯一索引 (portfolio_id, trade_date) 保证幂等 */
export async function upsertEquitySnapshotService(input: {
  userId: string
  portfolioId: string
  tradeDate: string
  equity: number
  cash: number
  marketValue: number
}): Promise<EquitySnapshot> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolio_equity_snapshots')
    .upsert(toDbEquitySnapshotRow(input), {
      onConflict: 'portfolio_id,trade_date',
    })
    .select('*')
    .single()
  if (error) throw new Error(`upsertEquitySnapshotService failed: ${error.message}`)
  return fromDbEquitySnapshotRow(data)
}

/** 拉一个 portfolio 全部 snapshots(按 trade_date DESC) */
export async function listSnapshotsByPortfolioService(
  portfolioId: string,
): Promise<EquitySnapshot[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolio_equity_snapshots')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: false })
  if (error) throw new Error(`listSnapshotsByPortfolioService failed: ${error.message}`)
  return (data ?? []).map(fromDbEquitySnapshotRow)
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/risk/query.ts
git commit -m "feat(risk): RLS + service-role query helpers for snapshots"
```

---

## Task 9: lib/risk/index.ts — 公共 API barrel

**Files:**
- Create: `src/lib/risk/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/risk/index.ts`:

```ts
export type {
  RiskAction,
  RiskContext,
  RiskRule,
  RiskDecisionLog,
  RiskEvaluationResult,
} from './types'
export {
  ALL_RULES,
  insufficientBuyingPowerRule,
  insufficientSellableSharesRule,
  maxPositionPctRule,
  maxPositionsRule,
  maxTotalExposureRule,
  maxDrawdownStopRule,
} from './rules'
export { evaluateRisk } from './engine'
export { computePeakEquity } from './peak'
export {
  computeEquityFromPortfolio,
  toDbEquitySnapshotRow,
  fromDbEquitySnapshotRow,
} from './equity-snapshot'
export {
  listSnapshotsByPortfolio,
  listSnapshotsByPortfolioService,
  upsertEquitySnapshotService,
} from './query'
export { RISK_MESSAGES, renderRiskMessage } from './messages'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/risk/index.ts
git commit -m "feat(risk): public API barrel"
```

---

## Task 10: lib/trading/broker.ts — BrokerAdapter 扩展(实盘字段预留)

**Files:**
- Modify: `src/lib/trading/broker.ts`
- Modify: `src/lib/trading/types.ts`(OrderRequest 扩展)

- [ ] **Step 1: 扩展 OrderRequest 类型**

修改 `src/lib/trading/types.ts` 中 `OrderRequest`:

```ts
/** 订单请求(给 BrokerAdapter.submitOrder) */
export interface OrderRequest {
  portfolioId: string
  symbolCode: string
  side: OrderSide
  shares: number
  intendedPrice: number
  /** 提交交易日 (cron run-strategies 当日) */
  tradeDate: string
  /** 客户端订单 id(可选,实盘券商用来幂等去重);PaperBroker 忽略 */
  clientOrderId?: string
}
```

- [ ] **Step 2: 扩展 BrokerAdapter 接口**

`src/lib/trading/broker.ts`(全文件):

```ts
import type { Order, OrderRequest, SettleResult } from './types'

/** BrokerAdapter 接口 —— 抽象所有券商交互(含实盘) */
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

  // ============== 实盘预留字段(本期不实现) ==============
  /** 实盘券商账户 id(可选;PaperBroker 返回 null) */
  accountId?(): Promise<string | null>
  /** 实盘券商 session token(可选;PaperBroker 返回 null) */
  getSessionToken?(): Promise<string | null>
  /** 实盘心跳检测(可选;PaperBroker 返回 'paper') */
  brokerKind?(): 'paper' | 'ctp' | 'xtp' | 'uft' | string
}
```

- [ ] **Step 3: 给 PaperBroker 加默认方法**

修改 `src/lib/trading/adapters/paper.ts`,在 `class PaperBroker` 内 `submitOrder` 之前加:

```ts
  brokerKind(): string {
    return 'paper'
  }

  async accountId(): Promise<string | null> {
    return null
  }

  async getSessionToken(): Promise<string | null> {
    return null
  }
```

(放在 `submitOrder` 之前即可,不破坏现有逻辑。)

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
pnpm test src/lib/trading/
```

预期: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/trading/broker.ts src/lib/trading/types.ts src/lib/trading/adapters/paper.ts
git commit -m "feat(broker): extend BrokerAdapter with live broker fields (accountId/sessionToken/brokerKind)"
```

---

## Task 11: lib/trading/adapters/README.md — 实盘 Broker 接入指南

**Files:**
- Create: `src/lib/trading/adapters/README.md`

- [ ] **Step 1: 写 README**

`src/lib/trading/adapters/README.md`:

```markdown
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
| `settlePendingOrders(orders)` | ✅ | 撮合;真实券商由其自身成交回报驱动,本期可用轮询 |
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
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/trading/adapters/README.md
git commit -m "docs(broker): live BrokerAdapter integration guide"
```

---

## Task 12: lib/data/adapters/README.md — 真实数据源接入指南

**Files:**
- Create: `src/lib/data/adapters/README.md`

- [ ] **Step 1: 写 README**

`src/lib/data/adapters/README.md`:

```markdown
# 真实数据源接入指南

> 本期(MVP)只实现 `MockDataProvider`(确定性伪随机,GBM)。
> 本文件说明**未来**如何接入 Tushare / AkShare / 通联等真实数据源。

## 1. 目标

实现一个新的 `MarketDataProvider`(例如 `TushareDataProvider`),被
`/api/cron/ingest-daily` 与 `ingest-minute` 通过依赖注入使用,**不**修改任何
cron 端点或回测引擎代码。

## 2. 文件结构

```
src/lib/data/adapters/
├── mock.ts          # 模拟数据(本期默认)
├── tushare.ts       # Tushare Pro(后续 phase)
├── akshare.ts       # AkShare(后续 phase)
└── README.md        # 本文件
```

## 3. 接口

见 `src/lib/data/provider.ts`:

```ts
export interface MarketDataProvider {
  listSymbols(): Promise<SymbolMeta[]>
  getDailyBars(symbol: string, from: string, to: string): Promise<DailyBar[]>
  getMinuteBars?(symbol: string, from: string, to: string): Promise<MinuteBar[]>
  providerKind(): 'mock' | 'tushare' | 'akshare' | string
}
```

## 4. 实现清单(Tushare 为例)

1. **环境变量**: `TUSHARE_TOKEN` 在 `.env.local` 配置,缺失则启动失败
2. **限流**: Tushare 普通账户 200 次/分钟,需加 token bucket;`p-queue` 推荐
3. **数据格式映射**: `ts_code` → `symbol_code`, `trade_date` → `trade_date`(YYYYMMDD → YYYY-MM-DD)
4. **涨跌停**: 真实数据自带;不需要 matchFill 重算
5. **停牌**: 真实数据 `vol=0` 时视为停牌;cron 跳过当日因子计算

## 5. 注入入口

在 `src/lib/data/factory.ts`(新建,后续 phase):

```ts
export function createMarketDataProvider(): MarketDataProvider {
  if (process.env.DATA_PROVIDER === 'tushare') {
    return new TushareDataProvider({ token: process.env.TUSHARE_TOKEN! })
  }
  return new MockDataProvider({ /* seed */ })
}
```

## 6. cron 兼容

现有 `/api/cron/ingest-daily` 调 `getDailyBars` 写入 `trade260915a_quant_daily_bars`。
真实数据源接入后,只需改 factory;**写入 schema 保持不变**。

## 7. 测试

每个 `<provider>.test.ts` 需覆盖:
- listSymbols 返回数量 + 字段
- getDailyBars 时间范围 + 字段(校验 ts_code 映射)
- providerKind() 返回正确字符串
- 网络错误重试(用 MSW 或 nock 模拟)

## 8. 回测保真度

真实数据接入后,回测结果会与 mock 差异较大,这是预期行为。建议:
- 接 Tushare 后跑 1 年回测,验证曲线形状合理
- 用 mock 跑回归测试,确保算法逻辑不变
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/data/adapters/README.md
git commit -m "docs(data): real MarketDataProvider integration guide"
```

---

## Task 13: lib/scheduler/cron-runner.ts — 通用 cron wrapper(错误告警 + 日志)

**Files:**
- Create: `src/lib/scheduler/cron-runner.ts`
- Create: `src/lib/scheduler/cron-runner.test.ts`

> 所有 cron 端点的统一入口:鉴权 + try/catch + 日志 + 写 strategy_run_log 错误。

- [ ] **Step 1: 写失败测试**

`src/lib/scheduler/cron-runner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { withCronGuard } from './cron-runner'

describe('withCronGuard', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const handler = vi.fn()
    const req = new Request('http://localhost/test')
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when Bearer token mismatches', async () => {
    const handler = vi.fn()
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    process.env.CRON_SECRET = 'correct-secret'
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler when Bearer token matches and returns its response', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const handler = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('returns 500 + logs error when handler throws', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn(async () => {
      throw new Error('boom')
    })
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    const res = await withCronGuard(req, handler, { name: 'test-cron' })
    expect(res.status).toBe(500)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test-cron'), expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('supports custom logger (e.g. record to DB)', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const logger = vi.fn()
    const handler = vi.fn(async () => {
      throw new Error('boom')
    })
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    await withCronGuard(req, handler, { name: 'test-cron', onError: logger })
    expect(logger).toHaveBeenCalledWith(expect.any(Error))
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/scheduler/cron-runner.test.ts
```

预期: FAIL — `Cannot find module './cron-runner'`。

- [ ] **Step 3: 实现 cron-runner.ts**

`src/lib/scheduler/cron-runner.ts`:

```ts
/**
 * 通用 cron Route Handler wrapper:
 *   1. 鉴权:Authorization: Bearer ${CRON_SECRET}
 *   2. try/catch + console.error 日志
 *   3. 可选 onError 回调(写 strategy_run_log 或发告警)
 *
 * 用法:
 *
 *   import { withCronGuard } from '@/lib/scheduler/cron-runner'
 *
 *   export async function POST(req: Request) {
 *     return withCronGuard(req, async () => {
 *       // 业务逻辑
 *       return Response.json({ ok: true })
 *     }, { name: 'run-strategies' })
 *   }
 */

export interface CronGuardOptions {
  /** 日志标签(默认 'cron') */
  name?: string
  /** 自定义错误处理(默认 console.error) */
  onError?: (err: unknown) => void | Promise<void>
}

export async function withCronGuard(
  req: Request,
  handler: () => Promise<Response>,
  opts: CronGuardOptions = {},
): Promise<Response> {
  const { name = 'cron', onError } = opts
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // 启动期就应该 fail;运行时再 fail 是配置错误,显式抛
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
  const auth = req.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth !== expectedHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    return await handler()
  } catch (err) {
    console.error(`[cron:${name}] failed`, err)
    if (onError) await onError(err)
    return new Response(
      JSON.stringify({ error: 'internal_error', cron: name }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/scheduler/cron-runner.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/scheduler/cron-runner.ts src/lib/scheduler/cron-runner.test.ts
git commit -m "feat(scheduler): withCronGuard wrapper (auth + error handling + logging)"
```

---

## Task 14: /api/cron/run-strategies 接入风控引擎

**Files:**
- Modify: `src/app/api/cron/run-strategies/route.ts`
- Create: `src/app/api/cron/run-strategies/route.test.ts`(可选,集成测试)

> 改造点:
> 1. 把现有的"生成 plan → submitOrder"流程改为"生成 plan → evaluateRisk → 处理 stop/modify/reject → submitOrder"
> 2. stop 时把 portfolio 标 stopped + 写 stop_reason,跳过该 portfolio 后续订单
> 4. modify 后用改写的 intents 提交
> 5. run_log.notes 记录风控日志

- [ ] **Step 1: 改写 route.ts**

`src/app/api/cron/run-strategies/route.ts`(全文件):

```ts
import { NextResponse } from 'next/server'
import { withCronGuard } from '@/lib/scheduler/cron-runner'
import {
  evaluateRisk,
  computeEquityFromPortfolio,
  computePeakEquity,
  listSnapshotsByPortfolioService,
} from '@/lib/risk'
import { getStrategy } from '@/lib/strategy/query'
import {
  generateRebalancePlan,
  listActivePortfoliosService,
  getPortfolioService,
  listPositionsService,
  upsertPositionService,
  insertOrderService,
  savePortfolioCashService,
  setPortfolioStatusService,
  insertRunLogService,
  getDailyBarsService,
  listSymbolsService,
} from '@/lib/trading/query'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RunResult {
  portfolioId: string
  signalsCount: number
  ordersCount: number
  stopped: boolean
  stopReasonCode: string | null
  notes: string | null
}

export async function POST(req: Request) {
  return withCronGuard(
    req,
    async () => {
      const today = new Date().toISOString().slice(0, 10)
      const symbols = await listSymbolsService()
      const symbolsList = symbols.map((s) => s.symbolCode)

      const portfolios = await listActivePortfoliosService()
      const results: RunResult[] = []

      for (const portfolio of portfolios) {
        try {
          const strategy = await getStrategy(portfolio.strategyId)
          if (!strategy) {
            results.push({
              portfolioId: portfolio.id, signalsCount: 0, ordersCount: 0,
              stopped: false, stopReasonCode: null,
              notes: 'strategy_missing',
            })
            continue
          }
          const positions = await listPositionsService(portfolio.id)
          const bars = await getDailyBarsService(symbolsList, today, today)
          const barsBySymbol = new Map(bars.map((b) => [b.symbolCode, b]))

          const plan = generateRebalancePlan({
            portfolio,
            positions,
            spec: strategy.spec,
            symbols: symbolsList,
            barsBySymbol,
            today,
          })

          // 准备风控 context
          const lastCloseBySymbol = new Map<string, number>()
          for (const [sym, bar] of barsBySymbol.entries()) lastCloseBySymbol.set(sym, bar.close)
          const equity = computeEquityFromPortfolio({
            cash: portfolio.cash,
            positions: positions.map((p) => ({ symbolCode: p.symbolCode, shares: p.shares })),
            lastCloseBySymbol,
          })
          const snapshots = await listSnapshotsByPortfolioService(portfolio.id)
          const peakEquity = computePeakEquity({ portfolio, currentEquity: equity, snapshots })

          const riskResult = evaluateRisk({
            plan,
            ctx: {
              portfolio,
              positions,
              positionsBySymbol: new Map(positions.map((p) => [p.symbolCode, p])),
              cash: portfolio.cash,
              equity,
              peakEquity,
              today,
              appliedModifies: [],
            },
            spec: strategy.spec,
          })

          // stop → 标 portfolio + 跳过订单
          if (riskResult.stopped) {
            await setPortfolioStatusService(portfolio.id, 'stopped', riskResult.stopReasonCode)
            await insertRunLogService({
              userId: portfolio.userId,
              portfolioId: portfolio.id,
              tradeDate: today,
              signalsCount: plan.intents.length,
              ordersCount: 0,
              notes: `stopped:${riskResult.stopReasonCode}`,
            })
            results.push({
              portfolioId: portfolio.id,
              signalsCount: plan.intents.length,
              ordersCount: 0,
              stopped: true,
              stopReasonCode: riskResult.stopReasonCode,
              notes: `stopped:${riskResult.stopReasonCode}`,
            })
            continue
          }

          // 用 finalIntents 落库订单(modify 后)
          let ordersCount = 0
          for (const intent of riskResult.finalIntents) {
            const o = await insertOrderService({
              userId: portfolio.userId,
              portfolioId: portfolio.id,
              symbolCode: intent.symbolCode,
              side: intent.side,
              shares: intent.shares,
              intendedPrice: intent.intendedPrice,
              tradeDate: today,
            })
            if (o) ordersCount += 1
          }

          await insertRunLogService({
            userId: portfolio.userId,
            portfolioId: portfolio.id,
            tradeDate: today,
            signalsCount: plan.intents.length,
            ordersCount,
            notes: riskResult.log.map((l) => `${l.ruleId}:${l.action}`).join(',') || null,
          })
          results.push({
            portfolioId: portfolio.id,
            signalsCount: plan.intents.length,
            ordersCount,
            stopped: false,
            stopReasonCode: null,
            notes: null,
          })
        } catch (err) {
          // 单 portfolio 失败不影响整体(避免一个 portfolio 错误阻塞其他)
          console.error(`[run-strategies] portfolio ${portfolio.id} failed`, err)
          results.push({
            portfolioId: portfolio.id,
            signalsCount: 0, ordersCount: 0, stopped: false, stopReasonCode: null,
            notes: 'per_portfolio_error',
          })
        }
      }

      return NextResponse.json({
        date: today,
        portfoliosProcessed: results.length,
        results,
      })
    },
    { name: 'run-strategies' },
  )
}
```

> **注意**: 实现者需要先在 `src/lib/trading/query.ts` 里把以下 helper 补全:
> - `listSymbolsService()`: 调 service_role 列出 `trade260915a_quant_symbols`
> - `getDailyBarsService(symbols, from, to)`: 调 service_role 拉日线
> - `setPortfolioStatusService(id, status, reason)`: **Phase 3 只有 user-side `setPortfolioStatus`**,需新增 service-role 版本(参考 `setPortfolioStatus` 的实现,但用 `createServiceRoleClient()`)
> - `getStrategy(id)` / `generateRebalancePlan`: Phase 3 已存在
>
> 若 Phase 3 没有 `listSymbolsService` / `getDailyBarsService`,在 `src/lib/trading/query.ts`
> 末尾追加(参考 `listPendingOrdersService` 的实现风格,调 `trade260915a_quant_symbols` 与
> `trade260915a_quant_daily_bars` 表)。`setPortfolioStatusService` 同理补一个 service-role
> 版本,因为 cron 不带用户 session。

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS(若 helper 缺失,先补 helper 再 typecheck)。

- [ ] **Step 3: 单元测试(可选,但推荐)— 验证 cron 编排不依赖 DB**

```bash
# 简化:route.ts 测试留给 Task 22 集成测试覆盖
# 本期只验证编译通过即可
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/cron/run-strategies/route.ts src/lib/trading/query.ts
git commit -m "feat(cron): integrate riskEngine into run-strategies + per-portfolio error handling"
```

---

## Task 15: /api/cron/settle-pending 写入 equity snapshot

**Files:**
- Modify: `src/app/api/cron/settle-pending/route.ts`

> 在现有 settle-pending 逻辑末尾加一步:对每个 portfolio 计算 equity,upsert snapshot。
> 注意:settle-pending 单日可被触发多次(每 15 分钟),upsert by (portfolio_id, trade_date) 保证幂等。

- [ ] **Step 1: 在 settle-pending 末尾追加 snapshot 写入**

修改 `src/app/api/cron/settle-pending/route.ts`,在原 route handler 业务逻辑末尾(撮合循环结束后)加入:

```ts
// ============ 写入 equity snapshot(cron 末尾,幂等) ============
const { upsertEquitySnapshotService } = await import('@/lib/risk/query')
const { computeEquityFromPortfolio } = await import('@/lib/risk')

for (const portfolio of activePortfolios) {
  const positions = await listPositionsService(portfolio.id)
  const bars = await getDailyBarsService(
    Array.from(new Set(positions.map((p) => p.symbolCode))),
    tradeDate, tradeDate,
  )
  const lastCloseBySymbol = new Map(bars.map((b) => [b.symbolCode, b.close]))
  const positionsLite = positions.map((p) => ({ symbolCode: p.symbolCode, shares: p.shares }))
  const equity = computeEquityFromPortfolio({
    cash: portfolio.cash, positions: positionsLite, lastCloseBySymbol,
  })
  const marketValue = equity - portfolio.cash
  await upsertEquitySnapshotService({
    userId: portfolio.userId,
    portfolioId: portfolio.id,
    tradeDate,
    equity,
    cash: portfolio.cash,
    marketValue: marketValue > 0 ? marketValue : 0,
  })
}
```

> 把 `activePortfolios` 替换成实际业务里遍历的 portfolio 列表名(沿用 Phase 3 实现)。
> 如果原实现没有先收集 active portfolios 列表,改为在循环内对每个 portfolio 单独算。

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/cron/settle-pending/route.ts
git commit -m "feat(cron): record equity snapshot after settle-pending fills"
```

---

## Task 16: 改造 /api/cron/t1-settle 用 cron-runner wrapper

**Files:**
- Modify: `src/app/api/cron/t1-settle/route.ts`

- [ ] **Step 1: 包一层 withCronGuard**

修改 `src/app/api/cron/t1-settle/route.ts`,把 `export async function POST` 改为:

```ts
import { withCronGuard } from '@/lib/scheduler/cron-runner'

export async function POST(req: Request) {
  return withCronGuard(req, async () => {
    // 原 t1-settle 业务逻辑(沿用 Phase 3)
    // ...
    return NextResponse.json({ ok: true })
  }, { name: 't1-settle' })
}
```

> 同样对 `/api/cron/ingest-daily` 与 `/api/cron/ingest-minute` 应用相同 wrapper(可选,
> 本期至少 `t1-settle` 必须包;其他端点在下一次迭代统一包)。

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/cron/t1-settle/route.ts
git commit -m "feat(cron): wrap t1-settle with withCronGuard"
```

---

## Task 17: i18n — quant.risk.* + quant.cron.* + quant.portfolio.*

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 的 `quant` 对象下添加 `risk` / `cron.error` / `portfolio.peakEquity` / `portfolio.drawdown` 子树**

找到 `"quant": { ... }` 内,在大括号闭合 `}` 前插入:

```json
,
    "risk": {
      "title": "风控",
      "evaluating": "风控评估中...",
      "stoppedBy": "策略已被风控停止:{reason}",
      "peakEquity": "历史最高权益",
      "currentDrawdown": "当前回撤",
      "drawdownLimit": "回撤止损线",
      "decisionLog": "风控决策日志",
      "rule": {
        "INSUFFICIENT_BUYING_POWER": "可用资金不足",
        "INSUFFICIENT_SELLABLE_SHARES": "可卖股数不足(T+1 解禁未到)",
        "MAX_POSITION_PCT": "单仓位超限",
        "MAX_POSITIONS": "持仓数超限",
        "MAX_TOTAL_EXPOSURE": "总仓位超限",
        "MAX_DRAWDOWN_STOP": "回撤止损触发"
      },
      "action": {
        "allow": "通过",
        "modify": "调整",
        "reject": "拒绝",
        "stop": "停止"
      }
    },
    "cron": {
      "error": {
        "title": "定时任务失败",
        "retrying": "Vercel 将自动重试"
      }
    }
```

- [ ] **Step 2: 在 zh.json 中 `portfolio` 下添加 `peakEquity` / `drawdown` / `stopReason`**

找到 `"portfolio": { ... }` 内,在大括号闭合 `}` 前插入:

```json
,
      "peakEquity": "历史最高权益 {value}",
      "drawdown": "当前回撤 {pct}%",
      "stopReason": "停止原因:{reason}",
      "statusStopped": "已停止"
```

- [ ] **Step 3: 同样修改 en.json**

`src/locales/en.json` 在 `quant.risk` / `quant.cron.error` / `quant.portfolio.*` 下加:

```json
"risk": {
  "title": "Risk",
  "evaluating": "Evaluating risk...",
  "stoppedBy": "Strategy stopped by risk: {reason}",
  "peakEquity": "Peak equity",
  "currentDrawdown": "Current drawdown",
  "drawdownLimit": "Drawdown limit",
  "decisionLog": "Risk decision log",
  "rule": {
    "INSUFFICIENT_BUYING_POWER": "Insufficient buying power",
    "INSUFFICIENT_SELLABLE_SHARES": "Insufficient sellable shares (T+1 lock)",
    "MAX_POSITION_PCT": "Single position exceeds limit",
    "MAX_POSITIONS": "Number of positions exceeds limit",
    "MAX_TOTAL_EXPOSURE": "Total exposure exceeds limit",
    "MAX_DRAWDOWN_STOP": "Drawdown stop triggered"
  },
  "action": {
    "allow": "Allow",
    "modify": "Modify",
    "reject": "Reject",
    "stop": "Stop"
  }
},
"cron": {
  "error": {
    "title": "Cron job failed",
    "retrying": "Vercel will auto-retry"
  }
}
```

以及 `portfolio.peakEquity` / `portfolio.drawdown` / `portfolio.stopReason` / `portfolio.statusStopped`:

```json
"peakEquity": "Peak equity {value}",
"drawdown": "Current drawdown {pct}%",
"stopReason": "Stop reason: {reason}",
"statusStopped": "Stopped"
```

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
pnpm lint
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): quant.risk / quant.cron.error / portfolio.peakEquity / portfolio.drawdown"
```

---

## Task 18: portfolio UI — peak equity / drawdown / stop reason

**Files:**
- Modify: `src/app/(dashboard)/portfolio/page.tsx`
- Create: `src/components/portfolio/risk-summary.tsx`(Client Component 包装)

- [ ] **Step 1: 新建 RiskSummary 组件**

`src/components/portfolio/risk-summary.tsx`:

```tsx
'use client'

import { useFormatter, useTranslations } from 'next-intl'

interface RiskSummaryProps {
  peakEquity: number
  currentEquity: number
  drawdownPct: number
  drawdownLimit: number
  status: 'active' | 'paused' | 'stopped'
  stopReason: string | null
  locale: 'en' | 'zh'
}

export function RiskSummary(props: RiskSummaryProps) {
  const t = useTranslations('quant.portfolio')
  const tr = useTranslations('quant.risk')
  const fmt = useFormatter()

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700">{tr('title')}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-500">{tr('peakEquity')}</dt>
          <dd className="text-base font-medium">
            {fmt.number(props.peakEquity, { style: 'currency', currency: 'CNY' })}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">{tr('currentDrawdown')}</dt>
          <dd
            className={`text-base font-medium ${
              props.drawdownPct >= props.drawdownLimit ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {props.drawdownPct.toFixed(2)}%
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">{tr('drawdownLimit')}</dt>
          <dd className="text-base font-medium">{props.drawdownLimit}%</dd>
        </div>
        <div>
          <dt className="text-gray-500">Status</dt>
          <dd className="text-base font-medium">
            {props.status === 'stopped' ? t('statusStopped') : props.status}
          </dd>
        </div>
      </dl>
      {props.status === 'stopped' && props.stopReason && (
        <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {t('stopReason', { reason: props.stopReason })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在 /portfolio/page.tsx 接入 RiskSummary**

修改 `src/app/(dashboard)/portfolio/page.tsx`:

```ts
import { RiskSummary } from '@/components/portfolio/risk-summary'
import { computeEquityFromPortfolio, computePeakEquity } from '@/lib/risk'
import { listSnapshotsByPortfolio } from '@/lib/risk/query'
import { getDailyBars } from '@/lib/data'

// 假设 portfolio 已经从 query 拿到(沿用 Phase 3)
// 假设 strategy spec 可以通过 strategy_id 拿(沿用 Phase 1 query.getStrategy)

export default async function PortfolioPage() {
  // ... 原 portfolio / positions / cash 逻辑

  // 新增:计算 peak / drawdown / status
  const lastCloseBySymbol = new Map<string, number>()
  // 拉最新一日所有持仓的 bar
  const today = new Date().toISOString().slice(0, 10)
  const bars = await getDailyBars(
    Array.from(new Set(positions.map((p) => p.symbolCode))),
    today, today,
  )
  for (const b of bars) lastCloseBySymbol.set(b.symbolCode, b.close)

  const equity = computeEquityFromPortfolio({
    cash: portfolio.cash,
    positions: positions.map((p) => ({ symbolCode: p.symbolCode, shares: p.shares })),
    lastCloseBySymbol,
  })
  const snapshots = await listSnapshotsByPortfolio(portfolio.id)
  const peakEquity = computePeakEquity({ portfolio, currentEquity: equity, snapshots })
  const drawdownPct = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0
  const strategy = await getStrategy(portfolio.strategyId)
  const drawdownLimit = strategy?.spec.holding.maxDrawdownPct ?? 10

  return (
    <div>
      {/* 原 summary 卡 */}
      ...
      <RiskSummary
        peakEquity={peakEquity}
        currentEquity={equity}
        drawdownPct={Math.abs(drawdownPct)}
        drawdownLimit={drawdownLimit}
        status={portfolio.status}
        stopReason={portfolio.stopReason}
        locale={locale}
      />
      ...
    </div>
  )
}
```

> **简化说明**: 实现者按 Phase 3 实际 page.tsx 结构插入 RiskSummary,核心 4 个 prop(peakEquity / drawdownPct / drawdownLimit / status)必须传入。

- [ ] **Step 3: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/components/portfolio/risk-summary.tsx src/app/(dashboard)/portfolio/page.tsx
git commit -m "feat(portfolio-ui): RiskSummary (peak equity / drawdown / stop reason)"
```

---

## Task 19: strategy detail UI — 风控决策日志

**Files:**
- Create: `src/components/strategy/risk-decision-log.tsx`
- Modify: `src/app/(dashboard)/strategy/[id]/page.tsx`

- [ ] **Step 1: 新建 RiskDecisionLog 组件**

`src/components/strategy/risk-decision-log.tsx`:

```tsx
import { useTranslations } from 'next-intl'

interface DecisionEntry {
  ruleId: string
  action: 'allow' | 'modify' | 'reject' | 'stop'
  reasonCode: string | null
}

interface RiskDecisionLogProps {
  notes: string | null  // run_log.notes(逗号分隔 "RULE:ACTION")
}

/** 解析 run_log.notes 字符串为 DecisionEntry[] */
function parseNotes(notes: string | null): DecisionEntry[] {
  if (!notes) return []
  return notes
    .split(',')
    .filter(Boolean)
    .map((seg) => {
      const [ruleId, action] = seg.split(':')
      return {
        ruleId,
        action: (action ?? 'allow') as DecisionEntry['action'],
        reasonCode: null,
      }
    })
}

export function RiskDecisionLog({ notes }: RiskDecisionLogProps) {
  const t = useTranslations('quant.risk')
  const entries = parseNotes(notes)
  if (entries.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700">{t('decisionLog')}</h3>
      <ul className="mt-3 space-y-1 text-sm">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center justify-between">
            <span className="text-gray-700">{t(`rule.${e.ruleId}`)}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                e.action === 'allow'
                  ? 'bg-green-100 text-green-700'
                  : e.action === 'modify'
                  ? 'bg-yellow-100 text-yellow-700'
                  : e.action === 'reject'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {t(`action.${e.action}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: 在 /strategy/[id]/page.tsx 接入**

修改 `src/app/(dashboard)/strategy/[id]/page.tsx`,在合适位置(spec 卡片下、run log 表上方)插入:

```tsx
import { RiskDecisionLog } from '@/components/strategy/risk-decision-log'
import { listRunLogs } from '@/lib/trading/query'

// 在 page 内部,假设 runLogs 已通过 listRunLogs(strategy.id) 拿到:
const latestRunLog = runLogs[0]

<RiskDecisionLog notes={latestRunLog?.notes ?? null} />
```

- [ ] **Step 3: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/components/strategy/risk-decision-log.tsx src/app/(dashboard)/strategy/[id]/page.tsx
git commit -m "feat(strategy-ui): RiskDecisionLog on strategy detail (latest run)"
```

---

## Task 20: 集成测试 — 风险引擎 + cron 幂等

**Files:**
- Create: `src/lib/risk/integration.test.ts`

- [ ] **Step 1: 写测试(用 vitest + 真实 Supabase 调用)**

`src/lib/risk/integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  upsertEquitySnapshotService,
  listSnapshotsByPortfolioService,
} from './query'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  describe.skip('integration (skipped — Supabase not configured)', () => {
    it('placeholder', () => {})
  })
} else {
  const admin = createClient(URL, SERVICE_KEY)

  // 测试用常量(UUID 任意;user_id 必须存在于 auth.users,否则 FK 失败)
  const TEST_EMAIL = 'risk-integration-test@example.com'
  const PORTFOLIO = '44444444-4444-4444-4444-444444444444'
  let USER_ID = '55555555-5555-5555-5555-555555555555'

  beforeAll(async () => {
    try {
      const created = await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: 'test-password-12345',
        email_confirm: true,
      })
      if (created.data.user?.id) USER_ID = created.data.user.id
    } catch {
      // 已存在则忽略;从已存在 user 中查 id
      const { data } = await admin.auth.admin.listUsers()
      const found = data?.users.find((u) => u.email === TEST_EMAIL)
      if (found) USER_ID = found.id
    }
    await admin.from('trade260915a_portfolio_equity_snapshots').delete().eq('portfolio_id', PORTFOLIO)
  })

  describe('upsertEquitySnapshotService — idempotency', () => {
    it('upsert twice on same (portfolio, trade_date) returns same row', async () => {
      const r1 = await upsertEquitySnapshotService({
        userId: USER_ID, portfolioId: PORTFOLIO, tradeDate: '2026-09-15',
        equity: 1_000_000, cash: 500_000, marketValue: 500_000,
      })
      const r2 = await upsertEquitySnapshotService({
        userId: USER_ID, portfolioId: PORTFOLIO, tradeDate: '2026-09-15',
        equity: 1_050_000, cash: 500_000, marketValue: 550_000, // update
      })
      expect(r1.tradeDate).toBe('2026-09-15')
      expect(r2.id).toBe(r1.id) // upsert 后 id 不变
      expect(r2.equity).toBe(1_050_000) // 值已更新
    })
  })

  describe('listSnapshotsByPortfolioService', () => {
    it('returns DESC sorted snapshots', async () => {
      await upsertEquitySnapshotService({
        userId: USER_ID, portfolioId: PORTFOLIO, tradeDate: '2026-09-13',
        equity: 900_000, cash: 500_000, marketValue: 400_000,
      })
      await upsertEquitySnapshotService({
        userId: USER_ID, portfolioId: PORTFOLIO, tradeDate: '2026-09-14',
        equity: 950_000, cash: 500_000, marketValue: 450_000,
      })
      const list = await listSnapshotsByPortfolioService(PORTFOLIO)
      expect(list.length).toBeGreaterThanOrEqual(3)
      expect(list[0].tradeDate).toBe('2026-09-15')
      expect(list[1].tradeDate).toBe('2026-09-14')
      expect(list[2].tradeDate).toBe('2026-09-13')
    })
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
git add src/lib/risk/integration.test.ts
git commit -m "test(risk): integration test skeleton (snapshot upsert idempotency)"
```

---

## Task 21: vercel.json cron 配置更新(snapshot 时机明确)

**Files:**
- Modify: `vercel.json`

> 现有 5 个 cron 端点(Phase 0-3)已配。本期:
> - `settle-pending` 每 15 分钟触发,前两次(t1-settle 跑完后)写入 equity snapshot
> - `run-strategies` 收盘 15:10 触发,集成风控
> - 时序保证:`t1-settle` (01:05 UTC) < `run-strategies` (07:10 UTC) < `settle-pending` 每 15min 起始 01:35 UTC

- [ ] **Step 1: 复核 vercel.json**

修改 `vercel.json`(如果原文件已有相关 cron 配置,无需改动;否则按以下模板):

```json
{
  "crons": [
    { "path": "/api/cron/ingest-daily", "schedule": "0 7 * * 1-5" },
    { "path": "/api/cron/ingest-minute", "schedule": "*/5 1-7 * * 1-5" },
    { "path": "/api/cron/run-strategies", "schedule": "10 7 * * 1-5" },
    { "path": "/api/cron/settle-pending", "schedule": "5,20,35,50 * * * 1-5" },
    { "path": "/api/cron/t1-settle", "schedule": "5 1 * * 1-5" }
  ]
}
```

> 时刻含义(UTC → 北京 UTC+8):
> - `ingest-daily` 07:00 UTC = 15:00 北京(收盘)
> - `ingest-minute` 每 5 分钟,09:00-15:00 北京
> - `run-strategies` 07:10 UTC = 15:10 北京(收盘调仓)
> - `settle-pending` 01:35 / 01:50 / 02:05 / 02:20 ... (每 15 分钟),覆盖 09:35-15:20 北京
> - `t1-settle` 01:05 UTC = 09:05 北京(T+1 解禁)

- [ ] **Step 2: 提交(若有改动)**

```bash
git diff vercel.json
git add vercel.json
git commit -m "chore(cron): verify vercel.json cron schedule for Phase 4 timing" || echo "no changes"
```

---

## Task 22: 验证 — 全量测试 + 覆盖率 + 端到端冒烟

- [ ] **Step 1: 全量单测**

```bash
pnpm test
```

预期: 全部 PASS(包含 Phase 0-3 全部 + Phase 4 lib/risk + lib/scheduler)。

- [ ] **Step 2: 覆盖率检查**

```bash
pnpm test:cov src/lib/risk/ src/lib/scheduler/cron-runner.ts
```

预期:
- `lib/risk/types.ts`: 100%
- `lib/risk/messages.ts`: 100%
- `lib/risk/peak.ts`: ≥ 95%
- `lib/risk/rules.ts`: ≥ 95%(6 条规则,重点)
- `lib/risk/engine.ts`: ≥ 90%
- `lib/risk/equity-snapshot.ts`: ≥ 95%
- `lib/scheduler/cron-runner.ts`: ≥ 90%
- **整体 `lib/risk/*` 行覆盖 ≥ 90%**(满足 spec §8.1)

- [ ] **Step 3: 编译 + lint**

```bash
pnpm typecheck
pnpm lint
```

预期: PASS。

- [ ] **Step 4: 端到端冒烟(本地开发)**

```bash
# 1. 启动本地 Supabase + 重置 db(让 006 migration 应用)
pnpm dlx supabase start
pnpm dlx supabase db reset

# 2. 配置 .env.local (含 CRON_SECRET)
echo 'CRON_SECRET=test-secret-123' >> .env.local

# 3. 启动 dev server
pnpm dev
```

**手工验证步骤:**

1. **注册 / 登录:** 注册账号 A,B。
2. **创建策略:** 账号 A 在 `/strategy/new` 创建策略,设 `maxDrawdownPct=5`。
3. **启动策略:** `/strategy/[id]`,点 "启动"。
4. **手动触发 run-strategies:**
   ```bash
   curl -X POST http://localhost:3000/api/cron/run-strategies \
     -H "Authorization: Bearer test-secret-123"
   ```
   预期: 返回 `{ portfoliosProcessed: 1, results: [...] }`,有 `ordersCount > 0`。
5. **手动触发 settle-pending:**
   ```bash
   curl -X POST http://localhost:3000/api/cron/settle-pending \
     -H "Authorization: Bearer test-secret-123"
   ```
   预期: 返回 `{ filled: N, ... }`。
6. **DB 检查 snapshot:**
   ```bash
   pnpm dlx supabase db psql --local -c "
     SELECT trade_date, equity, cash, market_value
       FROM trade260915a_portfolio_equity_snapshots
       ORDER BY trade_date DESC LIMIT 5;
   "
   ```
   预期: 至少 1 行,equity ≈ cash + 持仓市值。
7. **查看 portfolio UI:** `/portfolio` 看到 RiskSummary 卡,显示 peakEquity / drawdownPct=0 / status=active。
8. **模拟回撤:** 用 SQL 直接改 equity(把 cash 调小),再触发 run-strategies:
   ```bash
   pnpm dlx supabase db psql --local -c "
     UPDATE trade260915a_portfolios
        SET cash = 800000
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'a@test.com');
   "
   ```
   再触发 run-strategies:
   ```bash
   curl -X POST http://localhost:3000/api/cron/run-strategies \
     -H "Authorization: Bearer test-secret-123"
   ```
   预期: results 中该 portfolio `stopped: true, stopReasonCode: "MAX_DRAWDOWN_STOP"`,
   portfolio.status 被改成 `stopped`。
9. **DB 验证:**
   ```bash
   pnpm dlx supabase db psql --local -c "
     SELECT id, status, stop_reason FROM trade260915a_portfolios
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'a@test.com');
   "
   ```
   预期: `status=stopped, stop_reason=MAX_DRAWDOWN_STOP`。
10. **UI 验证:** `/portfolio` RiskSummary 显示红色 "Stopped / 停止原因: MAX_DRAWDOWN_STOP"。
11. **RLS 隔离:** 账号 B 看不到 A 的 snapshots 与 portfolio。
12. **风险日志:** `/strategy/[id]` RiskDecisionLog 展示最新一次 run 的 6 条规则结果(从 strategy_run_log.notes 解析)。

- [ ] **Step 5: 提交(若有临时改动)**

```bash
git status
# 若 clean 则跳过;若有临时改动,提交
```

---

## 风险与注意

- **风控 modify 链顺序:** 6 条规则中只有 MAX_POSITION_PCT 与 MAX_TOTAL_EXPOSURE 是 modify;两者都是基于 `ctx.equity` 而非当前 intent 总额。`maxPositionPctRule` 单笔 cap 之后,`maxTotalExposureRule` 再按 cap 总额。两者可能重复触发,实际效果是单笔先 cap,总额再 cap,顺序无歧义。
- **stop 的 portfolio 不再被 cron 处理:** `listActivePortfoliosService` 只返回 `status='active'`,stopped portfolio 自动被排除;不需要额外状态机维护。
- **snapshot 时机:** 选择 settle-pending 后(15:35 后)写 snapshot 是因为这之后 cash + positions 才是"当日终态"。run-strategies 后(15:10)写的话,若 15:00 收盘后停牌,持仓市值会算错(用 lastClose 算 0)。Phase 4 选择 settle-pending 后是更稳的方案。
- **snapshot 缺失场景:** 新启动的 portfolio 没有 snapshot,`computePeakEquity` 用当前 equity 当 peak,不会误触发止损。
- **实盘 Broker 接入:** 本期不实现,README 已写接缝;`BrokerAdapter` 接口已扩展 `accountId / sessionToken / brokerKind`,PaperBroker 默认返回 'paper' / null。
- **cron 失败重试:** Vercel Cron 默认会重试 3 次(指数退避),但失败时无外部告警;`withCronGuard` 把错误打到 console.error,运维通过 Vercel Logs 查看。后续 phase 接 Sentry / Slack 告警。
- **EquitySnapshot 跨日:** 每个 trade_date 一行;backfill 历史数据时按 trade_date 顺序 upsert 即可。
- **RiskDecisionLog notes 解析:** 用逗号分隔 `RULE:ACTION`,只能表达 action,不能表达 reasonCode。本期 UI 不显示具体 reasonCode;后续 phase 改为 JSONB 字段。
- **风控规则默认 limit:** `MAX_TOTAL_EXPOSURE` 默认 100%(不限制,沿用 Phase 3 rebalance 的 maxPositions × positionSizePct 隐式限制);若需要更严,可加 spec.holding.maxExposurePct 字段(本期不做)。
- **测试 fixture:** integration test 需要本地 Supabase 跑起来;若 CI 未配,本地手动验证即可(spec §8.3 允许)。

---

## 验收标准 (DoD)

- [ ] 全部 22 个 Task 完成且 commit
- [ ] `pnpm test` 全 PASS,`lib/risk/*` 行覆盖 ≥ 90%
- [ ] `pnpm typecheck` PASS,`pnpm lint` PASS
- [ ] 端到端冒烟 12 步全部通过(本地 dev)
- [ ] maxDrawdownPct=5% 策略跑出负收益后,portfolio.status 自动 → 'stopped'
- [ ] `MAX_DRAWDOWN_STOP` 触发后 portfolio 不再被 run-strategies 处理
- [ ] 所有 6 条规则单元测试覆盖 allow / reject / modify / stop 路径
- [ ] `/portfolio` 显示 peakEquity / drawdownPct / status / stopReason
- [ ] `/strategy/[id]` 显示最新一次 run 的 RiskDecisionLog
- [ ] RLS 隔离:B 用户看不到 A 的 snapshots
- [ ] `trade260915a_portfolio_equity_snapshots` 唯一索引 `(portfolio_id, trade_date)` 保证幂等
- [ ] `BrokerAdapter` 接口扩展了 `accountId` / `sessionToken` / `brokerKind`
- [ ] `lib/trading/adapters/README.md` 与 `lib/data/adapters/README.md` 实盘/真实数据接入指南完整
- [ ] 所有 cron 端点用 `withCronGuard` 包装,失败有日志

---

## 后续 Phase 接缝

- **Phase 5(可选):** 实盘 Broker 接入(CTP / XTP);扩展 `risk/rules.ts` 加 `STOP_LOSS_PER_TRADE`(单笔止损);新增 spec.holding.maxExposurePct 字段;RiskDecisionLog 改用 JSONB 字段。
- **Phase 6(可选):** 多账户 / 跨策略组合级别风控;cron 失败接 Sentry / Slack 告警;节假日表自动更新;分钟级实时调仓(改用券商推送)。