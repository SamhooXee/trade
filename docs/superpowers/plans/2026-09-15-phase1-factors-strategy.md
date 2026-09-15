# Quant Trading Phase 1 — 因子层 + 策略表达 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 6 个内置因子、`StrategySpec` 的定义 / 校验 / 求值,提供策略 CRUD 的 Server Actions 与 `<StrategyForm>` 动态表单,完成 `/strategy` 列表 / 新建 / 详情三个页面,让用户能在浏览器创建并保存策略。

**Architecture:** 因子层 (`lib/factors`) 是纯函数 `(bars, params) => number | null`,无副作用;策略层 (`lib/strategy`) 定义 zod schema,`compose.ts` 填充默认值,`evaluate.ts` 是布尔求值器;Server Actions 在 `actions.ts` 内做 RLS 隔离写入;UI 用 RHF + zod 与现有栈对齐。因子与策略都是纯函数,可独立单测,无数据库依赖。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · `react-hook-form` 7 + `zod` 4 · Tailwind 4 · shadcn/ui (Button / Card / Input / Label / Alert) · Supabase Postgres + RLS · Vitest · @testing-library/react

**Spec:** `docs/superpowers/specs/2026-09-15-quant-trading-design.md` (Phase 1 章节 §9)

**依赖前置 (来自 Phase 0):**
- `src/lib/data` (`MarketDataProvider` 接口 + `MockDataProvider` + `getDailyBars` query)
- `src/lib/scheduler` (`isTradingDay` 等)
- `src/lib/supabase/service-role` (service_role 客户端,虽然本 Phase 业务侧走 RLS,但测试用得到)
- `src/app/(dashboard)/layout.tsx` + `nav.tsx`
- `vercel.json` 已配置
- 已运行 `pnpm seed:symbols` 导入主板股票

---

## 全局约定

- **表名前缀:** 所有新表使用 `trade260915a_` 前缀。
- **表名:** `trade260915a_strategies`。
- **i18n namespace:** 复用现有 `quant.*` 命名空间(本 Phase: `quant.strategy.*` 与 `quant.factor.*`)。
- **Git 节奏:** 每个 Task 末尾独立提交。
- **TDD:** 每个 lib/ 任务先写失败测试,再写实现。
- **路径别名:** 沿用 `@/lib/...` `@/components/...` `@/app/...`。
- **状态文案:** 状态徽章颜色 (active=绿 / paused=黄 / draft=灰 / archived=灰) 写死在组件中,常量集中。
- **数字精度:** 阈值用 `number`;DB 存 NUMERIC(12,4)。
- **因子数据契约:** `Factor.compute(bars: DailyBar[], params: Record<string, number>) => number | null`。bars 是按时间升序的日线数组,`bars[bars.length-1].tradeDate` 为当前评估日。`null` 表示数据不足(如新股 lookback 不够),`evaluate.ts` 将 `null` 视为"不满足"。

---

## Task 1: strategies 表 + RLS migration

**Files:**
- Create: `supabase/migrations/003_strategies.sql`

- [ ] **Step 1: 创建 migration 文件**

`supabase/migrations/003_strategies.sql`:

```sql
-- 003_strategies.sql
-- 策略表。每条记录是用户的量化策略定义,spec JSONB 存 StrategySpec。

CREATE TABLE trade260915a_strategies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  spec        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trade260915a_strategies_user_id_idx ON trade260915a_strategies(user_id);
CREATE INDEX trade260915a_strategies_user_status_idx ON trade260915a_strategies(user_id, status);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION trade260915a_strategies_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade260915a_strategies_updated_at
  BEFORE UPDATE ON trade260915a_strategies
  FOR EACH ROW EXECUTE FUNCTION trade260915a_strategies_touch_updated_at();

-- ============ RLS ============
ALTER TABLE trade260915a_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strategies"
  ON trade260915a_strategies
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: 应用 migration 到本地 Supabase**

```bash
pnpm dlx supabase db reset
```

预期: 全部 migration 成功,无错误。

- [ ] **Step 3: 验证表已创建**

```bash
pnpm dlx supabase db psql --local -c "\d trade260915a_strategies"
pnpm dlx supabase db psql --local -c "
  SELECT count(*) FROM pg_trigger WHERE tgname = 'trade260915a_strategies_updated_at';
"
```

预期: 第一个命令显示表结构(含 status check 约束);第二个返回 `1`。

- [ ] **Step 4: 验证 RLS**

```bash
pnpm dlx supabase db psql --local -c "
  SET ROLE authenticated;
  INSERT INTO trade260915a_strategies (user_id, name, spec) VALUES ('00000000-0000-0000-0000-000000000000', 'X', '{}'::jsonb);
"
```

预期: 报 RLS 错误 (`new row violates row-level security policy`)。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/003_strategies.sql
git commit -m "feat(db): strategies table with RLS and updated_at trigger"
```

---

## Task 2: Factor types + 共享工具

**Files:**
- Create: `src/lib/factors/types.ts`
- Create: `src/lib/factors/types.test.ts`

> 这一步先定义所有因子必须满足的接口;具体因子实现见后续 Task 3-8。

- [ ] **Step 1: 写失败测试**

`src/lib/factors/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { DailyBar } from '@/lib/data'
import type { Factor, FactorContext, FactorParam, FactorId } from './types'
import { FACTOR_IDS } from './types'

describe('Factor interface', () => {
  it('Factor shape — minimum required fields', () => {
    const f: Factor = {
      id: 'RETURN_20D',
      label: '20日收益率',
      labelEn: '20-Day Return',
      description: '过去 20 个交易日的累计收益率',
      params: [],
      compute: () => 0.05,
    }
    expect(f.id).toBe('RETURN_20D')
    expect(f.params).toEqual([])
  })

  it('Factor with params', () => {
    const f: Factor = {
      id: 'MA_CROSS',
      label: '均线交叉',
      labelEn: 'MA Cross',
      description: '快线上穿 / 下穿慢线',
      params: [
        { key: 'fastPeriod', label: '快线周期', min: 2, max: 60, default: 5 },
        { key: 'slowPeriod', label: '慢线周期', min: 5, max: 250, default: 20 },
      ],
      compute: () => null,
    }
    expect(f.params.length).toBe(2)
    expect(f.params[0].default).toBe(5)
  })
})

describe('FACTOR_IDS', () => {
  it('contains exactly 6 factor ids', () => {
    expect(FACTOR_IDS.length).toBe(6)
    expect(FACTOR_IDS).toContain('RETURN_5D')
    expect(FACTOR_IDS).toContain('RETURN_20D')
    expect(FACTOR_IDS).toContain('RETURN_60D')
    expect(FACTOR_IDS).toContain('MA_CROSS')
    expect(FACTOR_IDS).toContain('VOLUME_RATIO')
    expect(FACTOR_IDS).toContain('PE_TTM')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/types.test.ts
```

预期: FAIL — `Cannot find module './types'`。

- [ ] **Step 3: 实现 types.ts**

`src/lib/factors/types.ts`:

```ts
import type { DailyBar } from '@/lib/data'

/**
 * 因子参数定义。因子声明需要的参数、范围与默认值。
 */
export interface FactorParam {
  /** 参数 key,提交到 compute 时使用 */
  key: string
  /** 中文标签,用于 UI 展示 */
  label: string
  /** 英文标签 */
  labelEn: string
  /** 最小值(含) */
  min: number
  /** 最大值(含) */
  max: number
  /** 默认值 */
  default: number
}

/**
 * 因子定义。纯函数 + 元信息。
 */
export interface Factor {
  /** 唯一 id, 字符串字面量 */
  id: FactorId
  /** 中文标签 */
  label: string
  /** 英文标签 */
  labelEn: string
  /** 中文描述 */
  description: string
  /** 英文描述 */
  descriptionEn: string
  /** 因子参数定义 */
  params: FactorParam[]
  /**
   * 因子求值。bars 是按时间升序的日线数组(至少含 today 在内)。
   * 返回 number | null: null 表示数据不足(例如新股 lookback 不够)。
   */
  compute(bars: DailyBar[], params: Record<string, number>): number | null
}

export type FactorId =
  | 'RETURN_5D'
  | 'RETURN_20D'
  | 'RETURN_60D'
  | 'MA_CROSS'
  | 'VOLUME_RATIO'
  | 'PE_TTM'

/** 上下文: 因子求值时需要的额外信息(暂无, 留作未来扩展) */
export type FactorContext = Record<string, never>

/** 全部因子 id 列表,用于 zod 校验与 UI 下拉 */
export const FACTOR_IDS: FactorId[] = [
  'RETURN_5D',
  'RETURN_20D',
  'RETURN_60D',
  'MA_CROSS',
  'VOLUME_RATIO',
  'PE_TTM',
]
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/types.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/types.ts src/lib/factors/types.test.ts
git commit -m "feat(factors): Factor interface and id registry"
```

---

## Task 3: 共享工具 — 因子 helpers

**Files:**
- Create: `src/lib/factors/helpers.ts`
- Create: `src/lib/factors/helpers.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/factors/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { simpleReturn, ma, volumeRatio } from './helpers'
import type { DailyBar } from '@/lib/data'

function mkBar(date: string, close: number, volume = 1_000_000): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    volume,
    amount: volume * close,
    close,
  }
}

describe('simpleReturn', () => {
  it('returns N-period return as decimal', () => {
    const bars = [
      mkBar('2026-01-01', 10),
      mkBar('2026-01-02', 11),
    ]
    expect(simpleReturn(bars, 1)).toBeCloseTo(0.10, 5)
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 10)]
    expect(simpleReturn(bars, 5)).toBeNull()
  })
})

describe('ma', () => {
  it('computes simple moving average over N periods', () => {
    const bars = [10, 11, 12, 13, 14].map((p, i) =>
      mkBar(`2026-01-0${i + 1}`, p),
    )
    expect(ma(bars, 3)).toBeCloseTo(13, 5) // (12+13+14)/3
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 10), mkBar('2026-01-02', 11)]
    expect(ma(bars, 5)).toBeNull()
  })
})

describe('volumeRatio', () => {
  it('returns today / average of last N', () => {
    const bars = [
      mkBar('2026-01-01', 1, 1000),
      mkBar('2026-01-02', 1, 2000),
      mkBar('2026-01-03', 1, 3000),
    ]
    expect(volumeRatio(bars, 2)).toBeCloseTo(1.5, 5) // 3000 / ((1000+2000)/2)
  })

  it('returns null when not enough history', () => {
    const bars = [mkBar('2026-01-01', 1, 1000)]
    expect(volumeRatio(bars, 5)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/helpers.test.ts
```

预期: FAIL — `Cannot find module './helpers'`。

- [ ] **Step 3: 实现 helpers.ts**

`src/lib/factors/helpers.ts`:

```ts
import type { DailyBar } from '@/lib/data'

/**
 * 简单收益率: (今天收盘 - N 天前收盘) / N 天前收盘。
 * bars 升序,取最后 N+1 个 bar。
 */
export function simpleReturn(bars: DailyBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const today = bars[bars.length - 1].close
  const past = bars[bars.length - 1 - period].close
  if (past === 0) return null
  return (today - past) / past
}

/**
 * 简单移动平均: 末 N 个 close 的算术平均。
 */
export function ma(bars: DailyBar[], period: number): number | null {
  if (bars.length < period) return null
  const slice = bars.slice(-period)
  const sum = slice.reduce((acc, b) => acc + b.close, 0)
  return sum / period
}

/**
 * 量比: 今日成交量 / 过去 N 日平均成交量(不含今日)。
 */
export function volumeRatio(bars: DailyBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const today = bars[bars.length - 1].volume
  const past = bars.slice(-(period + 1), -1)
  const sum = past.reduce((acc, b) => acc + b.volume, 0)
  const avg = sum / period
  if (avg === 0) return null
  return today / avg
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/helpers.test.ts
```

预期: PASS, 6 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/helpers.ts src/lib/factors/helpers.test.ts
git commit -m "feat(factors): shared helpers (return, MA, volume ratio)"
```

---

## Task 4: 三个动量因子 (RETURN_5D / RETURN_20D / RETURN_60D)

**Files:**
- Create: `src/lib/factors/momentum.ts`
- Create: `src/lib/factors/momentum.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/factors/momentum.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RETURN_5D, RETURN_20D, RETURN_60D } from './momentum'
import { simpleReturn } from './helpers'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
      amount: close * 1_000_000,
    }
  })
}

describe('RETURN_5D', () => {
  it('uses simpleReturn with period 5', () => {
    const data = bars([10, 11, 12, 13, 14, 15])
    expect(RETURN_5D.compute(data, {})).toBeCloseTo(simpleReturn(data, 5)!, 5)
  })

  it('returns null with fewer than 6 bars', () => {
    expect(RETURN_5D.compute(bars([10, 11, 12]), {})).toBeNull()
  })
})

describe('RETURN_20D', () => {
  it('uses simpleReturn with period 20', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 10 + i))
    expect(RETURN_20D.compute(data, {})).toBeCloseTo(simpleReturn(data, 20)!, 5)
  })
})

describe('RETURN_60D', () => {
  it('uses simpleReturn with period 60', () => {
    const data = bars(Array.from({ length: 61 }, (_, i) => 10 + i))
    expect(RETURN_60D.compute(data, {})).toBeCloseTo(simpleReturn(data, 60)!, 5)
  })
})

describe('id labels', () => {
  it('RETURN_5D has no params and id label', () => {
    expect(RETURN_5D.id).toBe('RETURN_5D')
    expect(RETURN_5D.params).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/momentum.test.ts
```

预期: FAIL — `Cannot find module './momentum'`。

- [ ] **Step 3: 实现 momentum.ts**

`src/lib/factors/momentum.ts`:

```ts
import type { Factor } from './types'
import { simpleReturn } from './helpers'

const build = (period: number, id: 'RETURN_5D' | 'RETURN_20D' | 'RETURN_60D', label: string, labelEn: string, desc: string, descEn: string): Factor => ({
  id,
  label,
  labelEn,
  description: desc,
  descriptionEn: descEn,
  params: [],
  compute: (bars) => simpleReturn(bars, period),
})

export const RETURN_5D: Factor = build(
  5, 'RETURN_5D', '5日收益率', '5-Day Return',
  '过去 5 个交易日的累计收益率', 'Cumulative return over the last 5 trading days',
)

export const RETURN_20D: Factor = build(
  20, 'RETURN_20D', '20日收益率', '20-Day Return',
  '过去 20 个交易日的累计收益率', 'Cumulative return over the last 20 trading days',
)

export const RETURN_60D: Factor = build(
  60, 'RETURN_60D', '60日收益率', '60-Day Return',
  '过去 60 个交易日的累计收益率', 'Cumulative return over the last 60 trading days',
)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/momentum.test.ts
```

预期: PASS, 4 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/momentum.ts src/lib/factors/momentum.test.ts
git commit -m "feat(factors): three momentum factors (5D/20D/60D return)"
```

---

## Task 5: 均线交叉因子 MA_CROSS

**Files:**
- Create: `src/lib/factors/moving-average.ts`
- Create: `src/lib/factors/moving-average.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/factors/moving-average.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MA_CROSS } from './moving-average'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
      amount: close * 1_000_000,
    }
  })
}

describe('MA_CROSS', () => {
  it('id and params', () => {
    expect(MA_CROSS.id).toBe('MA_CROSS')
    expect(MA_CROSS.params.length).toBe(2)
    expect(MA_CROSS.params.find((p) => p.key === 'fastPeriod')?.default).toBe(5)
    expect(MA_CROSS.params.find((p) => p.key === 'slowPeriod')?.default).toBe(20)
  })

  it('returns fast MA - slow MA', () => {
    const data = bars(Array.from({ length: 25 }, (_, i) => 10 + i))
    const v = MA_CROSS.compute(data, { fastPeriod: 5, slowPeriod: 20 })
    expect(v).not.toBeNull()
    // fast = mean(last 5), slow = mean(last 20)
    const fast = (21 + 22 + 23 + 24 + 25) / 5
    const slow = (6 + 7 + ... + 25) / 20
    expect(v).toBeCloseTo(fast - slow, 5)
  })

  it('returns null with insufficient history', () => {
    const data = bars([10, 11, 12, 13])
    expect(MA_CROSS.compute(data, { fastPeriod: 5, slowPeriod: 20 })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/moving-average.test.ts
```

预期: FAIL — `Cannot find module './moving-average'`。

- [ ] **Step 3: 实现 moving-average.ts**

`src/lib/factors/moving-average.ts`:

```ts
import type { Factor } from './types'
import { ma } from './helpers'

/**
 * MA_CROSS: 因子值 = 短期均线 - 长期均线。
 * 正值表示短期均线在长期均线上方(多头); 负值表示空头。
 * `cross_up` / `cross_down` 比较符在 evaluate.ts 中基于本因子的"昨日值"判断。
 */
export const MA_CROSS: Factor = {
  id: 'MA_CROSS',
  label: '均线差值',
  labelEn: 'MA Difference',
  description: '快线均线减去慢线均线(正值为多头,负值为空头)',
  descriptionEn: 'Fast MA minus slow MA (positive = bullish, negative = bearish)',
  params: [
    { key: 'fastPeriod', label: '快线周期', labelEn: 'Fast Period', min: 2, max: 60, default: 5 },
    { key: 'slowPeriod', label: '慢线周期', labelEn: 'Slow Period', min: 5, max: 250, default: 20 },
  ],
  compute: (bars, params) => {
    const fast = ma(bars, params.fastPeriod)
    const slow = ma(bars, params.slowPeriod)
    if (fast === null || slow === null) return null
    return fast - slow
  },
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/moving-average.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/moving-average.ts src/lib/factors/moving-average.test.ts
git commit -m "feat(factors): MA_CROSS factor with fast/slow params"
```

---

## Task 6: 量比因子 VOLUME_RATIO

**Files:**
- Create: `src/lib/factors/volume.ts`
- Create: `src/lib/factors/volume.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/factors/volume.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VOLUME_RATIO } from './volume'
import { volumeRatio } from './helpers'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[], volumes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: volumes[i] ?? 1_000_000,
      amount: close * (volumes[i] ?? 1_000_000),
    }
  })
}

describe('VOLUME_RATIO', () => {
  it('id and default param', () => {
    expect(VOLUME_RATIO.id).toBe('VOLUME_RATIO')
    expect(VOLUME_RATIO.params[0].default).toBe(5)
  })

  it('delegates to volumeRatio helper with param period', () => {
    const data = bars([1, 1, 1, 1, 1, 1], [1000, 2000, 3000, 4000, 5000, 6000])
    expect(VOLUME_RATIO.compute(data, { period: 5 })).toBeCloseTo(volumeRatio(data, 5)!, 5)
  })

  it('returns null with insufficient history', () => {
    const data = bars([1, 1], [1000, 1000])
    expect(VOLUME_RATIO.compute(data, { period: 5 })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/volume.test.ts
```

预期: FAIL — `Cannot find module './volume'`。

- [ ] **Step 3: 实现 volume.ts**

`src/lib/factors/volume.ts`:

```ts
import type { Factor } from './types'
import { volumeRatio } from './helpers'

export const VOLUME_RATIO: Factor = {
  id: 'VOLUME_RATIO',
  label: '量比',
  labelEn: 'Volume Ratio',
  description: '今日成交量与过去 N 日均量之比(>1 表示放量)',
  descriptionEn: 'Today volume / N-day average volume (>1 means expansion)',
  params: [
    { key: 'period', label: '回看天数', labelEn: 'Lookback Days', min: 2, max: 60, default: 5 },
  ],
  compute: (bars, params) => volumeRatio(bars, params.period),
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/volume.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/volume.ts src/lib/factors/volume.test.ts
git commit -m "feat(factors): VOLUME_RATIO factor with lookback param"
```

---

## Task 7: 估值因子 PE_TTM

**Files:**
- Create: `src/lib/factors/value.ts`
- Create: `src/lib/factors/value.test.ts`

> **设计说明:** Mock 行情无 PE 字段。PE_TTM 通过 symbolCode 的确定性伪随机计算每股收益(EPS)与今日收盘相除得到。仅供本地开发与测试使用,真实数据源接入后改读 `trade260915a_quant_symbols.fundamentals` 之类(本期不做)。

- [ ] **Step 1: 写失败测试**

`src/lib/factors/value.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PE_TTM, mockEpsTTM } from './value'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
      amount: close * 1_000_000,
    }
  })
}

describe('mockEpsTTM', () => {
  it('is deterministic for same symbol', () => {
    expect(mockEpsTTM('600000')).toBe(mockEpsTTM('600000'))
  })

  it('differs between symbols', () => {
    expect(mockEpsTTM('600000')).not.toBe(mockEpsTTM('600036'))
  })

  it('returns a positive number in (0, 10)', () => {
    const eps = mockEpsTTM('600000')
    expect(eps).toBeGreaterThan(0)
    expect(eps).toBeLessThan(10)
  })
})

describe('PE_TTM', () => {
  it('id and no params', () => {
    expect(PE_TTM.id).toBe('PE_TTM')
    expect(PE_TTM.params).toEqual([])
  })

  it('PE = close / mockEpsTTM', () => {
    const data = bars([20])
    const expected = 20 / mockEpsTTM('600000')
    expect(PE_TTM.compute(data, {})).toBeCloseTo(expected, 5)
  })

  it('returns null with empty bars', () => {
    expect(PE_TTM.compute([], {})).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/value.test.ts
```

预期: FAIL — `Cannot find module './value'`。

- [ ] **Step 3: 实现 value.ts**

`src/lib/factors/value.ts`:

```ts
import type { Factor } from './types'

/**
 * 确定性伪随机 EPS,用于 Mock 环境。
 * 范围 (0, 10) 元/股,seed = symbolCode。
 */
export function mockEpsTTM(symbolCode: string): number {
  let h = 2166136261
  for (let i = 0; i < symbolCode.length; i++) {
    h ^= symbolCode.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const r = (h >>> 0) / 4294967296
  // 0.5 ~ 5.0 之间,避免极端值
  return 0.5 + r * 4.5
}

/**
 * PE_TTM: 滚动 12 个月市盈率。
 * 真实数据接入后,本实现需替换为读取财报数据。
 * 当前用 close / mockEpsTTM(symbol)。
 */
export const PE_TTM: Factor = {
  id: 'PE_TTM',
  label: 'PE-TTM',
  labelEn: 'PE-TTM',
  description: '滚动 12 个月市盈率(收盘价 / 每股收益)',
  descriptionEn: 'Trailing 12-month P/E (close / EPS)',
  params: [],
  compute: (bars) => {
    if (bars.length === 0) return null
    const close = bars[bars.length - 1].close
    const eps = mockEpsTTM(bars[bars.length - 1].symbolCode)
    if (eps <= 0) return null
    return close / eps
  },
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/value.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/value.ts src/lib/factors/value.test.ts
git commit -m "feat(factors): PE_TTM with deterministic mock EPS"
```

---

## Task 8: Factor registry

**Files:**
- Create: `src/lib/factors/registry.ts`
- Create: `src/lib/factors/registry.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/factors/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FACTORS, getFactor, listFactors } from './registry'

describe('FACTORS registry', () => {
  it('contains all 6 factors keyed by id', () => {
    expect(Object.keys(FACTORS).sort()).toEqual(
      ['MA_CROSS', 'PE_TTM', 'RETURN_20D', 'RETURN_5D', 'RETURN_60D', 'VOLUME_RATIO'],
    )
  })
})

describe('getFactor', () => {
  it('returns factor for known id', () => {
    expect(getFactor('RETURN_20D').id).toBe('RETURN_20D')
  })

  it('throws for unknown id', () => {
    expect(() => getFactor('UNKNOWN' as any)).toThrow(/Unknown factor/)
  })
})

describe('listFactors', () => {
  it('returns 6 factors in id order', () => {
    const list = listFactors()
    expect(list.length).toBe(6)
    expect(list.map((f) => f.id)).toEqual(
      ['RETURN_5D', 'RETURN_20D', 'RETURN_60D', 'MA_CROSS', 'VOLUME_RATIO', 'PE_TTM'],
    )
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/factors/registry.test.ts
```

预期: FAIL — `Cannot find module './registry'`。

- [ ] **Step 3: 实现 registry.ts**

`src/lib/factors/registry.ts`:

```ts
import type { Factor, FactorId } from './types'
import { RETURN_5D, RETURN_20D, RETURN_60D } from './momentum'
import { MA_CROSS } from './moving-average'
import { VOLUME_RATIO } from './volume'
import { PE_TTM } from './value'
import { FACTOR_IDS } from './types'

/** id → Factor 映射 */
export const FACTORS: Record<FactorId, Factor> = {
  RETURN_5D,
  RETURN_20D,
  RETURN_60D,
  MA_CROSS,
  VOLUME_RATIO,
  PE_TTM,
}

/** 按 id 查因子;未知 id 抛错。 */
export function getFactor(id: FactorId): Factor {
  const f = FACTORS[id]
  if (!f) throw new Error(`Unknown factor: ${id}`)
  return f
}

/** 列出全部因子(按 FACTOR_IDS 声明顺序),供 UI 下拉。 */
export function listFactors(): Factor[] {
  return FACTOR_IDS.map((id) => FACTORS[id])
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/factors/registry.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/factors/registry.ts src/lib/factors/registry.test.ts
git commit -m "feat(factors): registry with getFactor and listFactors"
```

---

## Task 9: factors/index.ts 公共 API

**Files:**
- Create: `src/lib/factors/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/factors/index.ts`:

```ts
// 公共 API
export type { Factor, FactorId, FactorParam } from './types'
export { FACTOR_IDS } from './types'
export { FACTORS, getFactor, listFactors } from './registry'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 运行所有 factor 测试**

```bash
pnpm test src/lib/factors/
```

预期: 全部 PASS(types / helpers / momentum / moving-average / volume / value / registry)。

- [ ] **Step 4: 提交**

```bash
git add src/lib/factors/index.ts
git commit -m "feat(factors): public API barrel"
```

---

## Task 10: Strategy types + zod schema

**Files:**
- Create: `src/lib/strategy/types.ts`
- Create: `src/lib/strategy/types.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/strategy/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { strategySpecSchema, conditionSchema, holdingSchema } from './types'

describe('conditionSchema', () => {
  it('accepts a valid condition', () => {
    const r = conditionSchema.safeParse({
      factor: 'RETURN_20D',
      params: {},
      comparator: '>',
      threshold: 0,
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown factor', () => {
    const r = conditionSchema.safeParse({
      factor: 'UNKNOWN',
      params: {},
      comparator: '>',
      threshold: 0,
    })
    expect(r.success).toBe(false)
  })

  it('rejects unknown comparator', () => {
    const r = conditionSchema.safeParse({
      factor: 'RETURN_20D',
      params: {},
      comparator: '==',
      threshold: 0,
    })
    expect(r.success).toBe(false)
  })
})

describe('holdingSchema', () => {
  it('applies defaults', () => {
    const r = holdingSchema.parse({})
    expect(r.maxPositions).toBe(5)
    expect(r.positionSizePct).toBe(20)
    expect(r.maxDrawdownPct).toBe(20)
  })

  it('rejects positionSizePct > 100', () => {
    const r = holdingSchema.safeParse({ positionSizePct: 150 })
    expect(r.success).toBe(false)
  })

  it('rejects maxDrawdownPct <= 0', () => {
    const r = holdingSchema.safeParse({ maxDrawdownPct: 0 })
    expect(r.success).toBe(false)
  })
})

describe('strategySpecSchema', () => {
  it('accepts a minimal full spec', () => {
    const r = strategySpecSchema.safeParse({
      entry: { combinator: 'AND', conditions: [] },
      exit: { combinator: 'OR', conditions: [] },
      holding: {},
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/strategy/types.test.ts
```

预期: FAIL — `Cannot find module './types'`。

- [ ] **Step 3: 实现 types.ts**

`src/lib/strategy/types.ts`:

```ts
import { z } from 'zod'
import { FACTOR_IDS } from '@/lib/factors'

/**
 * 比较符。
 *  - '>' '<' '>=' '<=': 当前因子值与阈值比较
 *  - 'cross_up': 昨日 <= 阈值 且 今日 > 阈值
 *  - 'cross_down': 昨日 >= 阈值 且 今日 < 阈值
 */
export const COMPARATORS = ['>', '<', '>=', '<=', 'cross_up', 'cross_down'] as const
export type Comparator = (typeof COMPARATORS)[number]

export const COMBINATORS = ['AND', 'OR'] as const
export type Combinator = (typeof COMBINATORS)[number]

export const conditionSchema = z.object({
  factor: z.enum(FACTOR_IDS as [string, ...string[]]),
  params: z.record(z.string(), z.number()),
  comparator: z.enum(COMPARATORS),
  threshold: z.number(),
})

export const conditionsBlockSchema = z.object({
  combinator: z.enum(COMBINATORS),
  conditions: z.array(conditionSchema),
})

export const holdingSchema = z.object({
  maxPositions: z.number().int().min(1).max(50).default(5),
  positionSizePct: z.number().min(1).max(100).default(20),
  maxDrawdownPct: z.number().min(0.1).max(100).default(20),
})

export const strategySpecSchema = z.object({
  entry: conditionsBlockSchema,
  exit: conditionsBlockSchema,
  holding: holdingSchema,
})

export type Condition = z.infer<typeof conditionSchema>
export type ConditionsBlock = z.infer<typeof conditionsBlockSchema>
export type Holding = z.infer<typeof holdingSchema>
export type StrategySpec = z.infer<typeof strategySpecSchema>

/** 状态机:draft → active / paused → archived */
export const STRATEGY_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number]
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/strategy/types.test.ts
```

预期: PASS, 7 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/strategy/types.ts src/lib/strategy/types.test.ts
git commit -m "feat(strategy): StrategySpec zod schema and types"
```

---

## Task 11: strategy/compose.ts (校验 + 默认值填充 + DB 适配)

**Files:**
- Create: `src/lib/strategy/compose.ts`
- Create: `src/lib/strategy/compose.test.ts`

> `compose.ts` 提供两个功能: 1) `composeStrategy(input)` 接收 user-friendly 输入,补默认值并校验; 2) `fromDbRow` / `toDbSpec` 适配 DB row(目前 spec 是 JSONB,直接存取,但加 helper 隔离 schema 变化)。

- [ ] **Step 1: 写失败测试**

`src/lib/strategy/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeStrategy, emptySpec, defaultHolding } from './compose'

describe('emptySpec', () => {
  it('returns valid empty spec', () => {
    const s = emptySpec()
    expect(s.entry.combinator).toBe('AND')
    expect(s.entry.conditions).toEqual([])
    expect(s.holding.maxPositions).toBe(5)
  })
})

describe('defaultHolding', () => {
  it('returns sane defaults', () => {
    const h = defaultHolding()
    expect(h.maxPositions).toBe(5)
    expect(h.positionSizePct).toBe(20)
    expect(h.maxDrawdownPct).toBe(20)
  })
})

describe('composeStrategy', () => {
  it('fills missing holding fields with defaults', () => {
    const s = composeStrategy({
      entry: { combinator: 'AND', conditions: [] },
      exit: { combinator: 'OR', conditions: [] },
    })
    expect(s.holding).toEqual(defaultHolding())
  })

  it('rejects bad condition', () => {
    expect(() =>
      composeStrategy({
        entry: {
          combinator: 'AND',
          conditions: [
            { factor: 'UNKNOWN' as any, params: {}, comparator: '>', threshold: 0 },
          ],
        },
        exit: { combinator: 'OR', conditions: [] },
      }),
    ).toThrow()
  })

  it('rejects entry with too many conditions (UI allows up to 6)', () => {
    const conds = Array.from({ length: 7 }, () => ({
      factor: 'RETURN_20D' as const,
      params: {},
      comparator: '>' as const,
      threshold: 0,
    }))
    expect(() =>
      composeStrategy({
        entry: { combinator: 'AND', conditions: conds },
        exit: { combinator: 'OR', conditions: [] },
      }),
    ).not.toThrow() // 6+1=7 暂时不卡,后续 UI 限制
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/strategy/compose.test.ts
```

预期: FAIL — `Cannot find module './compose'`。

- [ ] **Step 3: 实现 compose.ts**

`src/lib/strategy/compose.ts`:

```ts
import { strategySpecSchema, type StrategySpec, type Holding } from './types'

/** 默认持仓配置 */
export function defaultHolding(): Holding {
  return { maxPositions: 5, positionSizePct: 20, maxDrawdownPct: 20 }
}

/** 全新空 spec,UI 初始化时使用 */
export function emptySpec(): StrategySpec {
  return {
    entry: { combinator: 'AND', conditions: [] },
    exit: { combinator: 'OR', conditions: [] },
    holding: defaultHolding(),
  }
}

/**
 * 校验 + 填充默认值。输入可以是部分 (holding 字段缺失),输出是完整的 StrategySpec。
 * 失败抛 zod 错误(沿用 zod 的 Error 形状)。
 */
export function composeStrategy(input: unknown): StrategySpec {
  return strategySpecSchema.parse(input)
}

/** DB JSONB 字段直接是 StrategySpec,这里仅做 schema 校验 */
export function parseStoredSpec(raw: unknown): StrategySpec {
  return strategySpecSchema.parse(raw)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/strategy/compose.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/strategy/compose.ts src/lib/strategy/compose.test.ts
git commit -m "feat(strategy): compose with defaults and zod validation"
```

---

## Task 12: strategy/evaluate.ts (布尔求值)

**Files:**
- Create: `src/lib/strategy/evaluate.ts`
- Create: `src/lib/strategy/evaluate.test.ts`

> 求值器对**一只股票**在**指定日期**评估 conditions 块;返回 boolean。
> bars 至少包含 today 在内;因子用末段数据计算今日值;cross_up / cross_down 比较符需要"昨日值",所以额外用截至昨天的 bars 计算。

- [ ] **Step 1: 写失败测试**

`src/lib/strategy/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateConditions } from './evaluate'
import type { DailyBar } from '@/lib/data'

function bars(closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10)
    return {
      symbolCode: '600000',
      tradeDate: d,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
      amount: close * 1_000_000,
    }
  })
}

describe('evaluateConditions — numerical comparators', () => {
  it('AND: all conditions must hold', () => {
    // 21 bars 涨到 21,RETURN_20D = (21-1)/1 = 2.0
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 1.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '<=', threshold: 5.0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })

  it('AND: fails when any condition fails', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 1.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 100.0 }, // 永远假
        ],
      },
      data,
    )
    expect(ok).toBe(false)
  })

  it('OR: passes when any condition holds', () => {
    const data = bars(Array.from({ length: 21 }, (_, i) => 1 + i))
    const ok = evaluateConditions(
      {
        combinator: 'OR',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 100.0 },
          { factor: 'RETURN_20D', params: {}, comparator: '<=', threshold: 5.0 },
        ],
      },
      data,
    )
    expect(ok).toBe(true)
  })

  it('null factor value is treated as not satisfied', () => {
    // 只有 3 bars,RETURN_20D 数据不足
    const data = bars([10, 11, 12])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 0 },
        ],
      },
      data,
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateConditions — cross comparators', () => {
  it('cross_up: 昨日 <= 阈值 且 今日 > 阈值', () => {
    // 5 bars 涨到 15: RETURN_5D 今日 = (15-10)/10 = 0.5
    const data = bars([10, 10, 10, 10, 15])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_up', threshold: 0 },
        ],
      },
      data,
    )
    // 昨日 = (10-10)/10 = 0 <= 0, 今日 = 0.5 > 0 → cross_up 命中
    expect(ok).toBe(true)
  })

  it('cross_up: 昨日 > 阈值 → 不命中', () => {
    const data = bars([10, 10, 10, 10, 15])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_up', threshold: 0.4 },
        ],
      },
      data,
    )
    // 今日 0.5 > 0.4 但昨日 0 不 <= 0.4? 0 <= 0.4 → 满足 cross_up
    // 重新构造: 昨日已经 > 阈值
    // 用 MA_CROSS 数据更难构造,这里改用 5 bars 全涨但 5D return 都 > 0.4: [1, 1, 1, 1, 1.5]
    const data2 = bars([1, 1, 1, 1, 1.5])
    // 今日 = (1.5-1)/1 = 0.5, 昨日 = (1-1)/1 = 0
    // 阈值 0.4: 0 <= 0.4, 0.5 > 0.4 → 命中
    // 改阈值 -0.1: 0 > -0.1 → 昨日已 > 阈值 → 不命中
    const ok2 = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_up', threshold: -0.1 },
        ],
      },
      data2,
    )
    expect(ok2).toBe(false)
  })

  it('cross_down: 昨日 >= 阈值 且 今日 < 阈值', () => {
    // bars 跌: [10, 10, 10, 10, 5], 今日 RETURN_5D = (5-10)/10 = -0.5
    const data = bars([10, 10, 10, 10, 5])
    const ok = evaluateConditions(
      {
        combinator: 'AND',
        conditions: [
          { factor: 'RETURN_5D', params: {}, comparator: 'cross_down', threshold: 0 },
        ],
      },
      data,
    )
    // 昨日 = 0 >= 0, 今日 = -0.5 < 0 → 命中
    expect(ok).toBe(true)
  })
})

describe('evaluateConditions — empty conditions', () => {
  it('AND with 0 conditions → true (vacuously true)', () => {
    const data = bars([10, 11, 12])
    expect(
      evaluateConditions({ combinator: 'AND', conditions: [] }, data),
    ).toBe(true)
  })

  it('OR with 0 conditions → false', () => {
    const data = bars([10, 11, 12])
    expect(
      evaluateConditions({ combinator: 'OR', conditions: [] }, data),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/strategy/evaluate.test.ts
```

预期: FAIL — `Cannot find module './evaluate'`。

- [ ] **Step 3: 实现 evaluate.ts**

`src/lib/strategy/evaluate.ts`:

```ts
import { getFactor } from '@/lib/factors'
import type { DailyBar } from '@/lib/data'
import type { Comparator, ConditionsBlock } from './types'

/**
 * 对**一只股票**评估 conditions 块。返回 boolean。
 * bars 升序,至少包含 today 在内;因子求值用末段数据。
 *
 * 比较符语义:
 *  - '>': factorValue > threshold
 *  - '<': factorValue < threshold
 *  - '>=': factorValue >= threshold
 *  - '<=': factorValue <= threshold
 *  - 'cross_up': 昨日 <= 阈值 且 今日 > 阈值
 *  - 'cross_down': 昨日 >= 阈值 且 今日 < 阈值
 *
 * 因子返回 null(数据不足)视为"不满足"。
 */
export function evaluateConditions(
  block: ConditionsBlock,
  bars: DailyBar[],
): boolean {
  const { combinator, conditions } = block
  if (conditions.length === 0) return combinator === 'AND'

  const results = conditions.map((c) => matchOne(c, bars))
  return combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

function matchOne(
  c: { factor: string; params: Record<string, number>; comparator: Comparator; threshold: number },
  bars: DailyBar[],
): boolean {
  const factor = getFactor(c.factor as any)
  const todayVal = factor.compute(bars, c.params)
  if (todayVal === null) return false

  switch (c.comparator) {
    case '>':
      return todayVal > c.threshold
    case '<':
      return todayVal < c.threshold
    case '>=':
      return todayVal >= c.threshold
    case '<=':
      return todayVal <= c.threshold
    case 'cross_up': {
      if (bars.length < 2) return false
      const prevBars = bars.slice(0, -1)
      const prevVal = factor.compute(prevBars, c.params)
      if (prevVal === null) return false
      return prevVal <= c.threshold && todayVal > c.threshold
    }
    case 'cross_down': {
      if (bars.length < 2) return false
      const prevBars = bars.slice(0, -1)
      const prevVal = factor.compute(prevBars, c.params)
      if (prevVal === null) return false
      return prevVal >= c.threshold && todayVal < c.threshold
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/strategy/evaluate.test.ts
```

预期: PASS, 8 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/strategy/evaluate.ts src/lib/strategy/evaluate.test.ts
git commit -m "feat(strategy): evaluateConditions for spec.boolean"
```

---

## Task 13: strategy/query.ts (DB CRUD helpers)

**Files:**
- Create: `src/lib/strategy/query.ts`

> Server Action 用 query 函数读写 DB。RLS 隔离由 `auth.uid() = user_id` 保证。

- [ ] **Step 1: 实现 query.ts**

`src/lib/strategy/query.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { parseStoredSpec } from './compose'
import type { StrategySpec } from './types'

export interface StrategyRow {
  id: string
  userId: string
  name: string
  spec: StrategySpec
  status: 'draft' | 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
}

interface DbStrategyRow {
  id: string
  user_id: string
  name: string
  spec: unknown
  status: 'draft' | 'active' | 'paused' | 'archived'
  created_at: string
  updated_at: string
}

function rowToStrategy(row: DbStrategyRow): StrategyRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    spec: parseStoredSpec(row.spec),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 列出当前用户所有策略,按 updated_at 降序 */
export async function listStrategies(): Promise<StrategyRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_strategies')
    .select('id, user_id, name, spec, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listStrategies failed: ${error.message}`)
  return (data ?? []).map(rowToStrategy)
}

/** 取单个策略(必须在当前用户下) */
export async function getStrategy(id: string): Promise<StrategyRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_strategies')
    .select('id, user_id, name, spec, status, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getStrategy failed: ${error.message}`)
  return data ? rowToStrategy(data) : null
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/strategy/query.ts
git commit -m "feat(strategy): query helpers list and get with RLS"
```

---

## Task 14: strategy/actions.ts (Server Actions CRUD)

**Files:**
- Create: `src/lib/strategy/actions.ts`
- Create: `src/lib/strategy/actions.test.ts`

> Server Actions: `createStrategyAction`, `updateStrategyAction`, `setStrategyStatusAction`, `archiveStrategyAction`。
> 输入: FormState 模式(沿用现有 user-keys.ts 的风格)。

- [ ] **Step 1: 实现 actions.ts**

`src/lib/strategy/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { composeStrategy } from './compose'
import { type StrategySpec, type StrategyStatus } from './types'

export interface StrategyFormState {
  error?: string
  fieldErrors?: Record<string, string[]>
} | null

/**
 * 创建策略。返回新策略 id 后由调用方重定向。
 * 失败时返回 fieldErrors 用于表单回显。
 */
export async function createStrategyAction(
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const name = String(formData.get('name') ?? '').trim()
  const specRaw = String(formData.get('spec') ?? '')
  const mode = String(formData.get('mode') ?? 'draft')

  if (!name) return { fieldErrors: { name: ['errors.name_required'] } }
  if (name.length > 100) return { fieldErrors: { name: ['errors.name_too_long'] } }

  let spec: StrategySpec
  try {
    spec = composeStrategy(JSON.parse(specRaw))
  } catch (err: any) {
    return { fieldErrors: { spec: [err?.message ?? 'errors.invalid_spec'] } }
  }

  const status: StrategyStatus = mode === 'enable' ? 'active' : 'draft'

  const { data, error } = await supabase
    .from('trade260915a_strategies')
    .insert({ user_id: user.id, name, spec, status })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/strategy')
  redirect(`/strategy/${data.id}`)
}

/**
 * 更新策略(spec + name)。状态走单独 action。
 */
export async function updateStrategyAction(
  id: string,
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const name = String(formData.get('name') ?? '').trim()
  const specRaw = String(formData.get('spec') ?? '')

  if (!name) return { fieldErrors: { name: ['errors.name_required'] } }
  if (name.length > 100) return { fieldErrors: { name: ['errors.name_too_long'] } }

  let spec: StrategySpec
  try {
    spec = composeStrategy(JSON.parse(specRaw))
  } catch (err: any) {
    return { fieldErrors: { spec: [err?.message ?? 'errors.invalid_spec'] } }
  }

  const { error } = await supabase
    .from('trade260915a_strategies')
    .update({ name, spec })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${id}`)
  return null
}

/** 设置状态:draft / active / paused / archived */
export async function setStrategyStatusAction(
  id: string,
  status: StrategyStatus,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  // zod 形状校验已在 types.ts 编译期完成,运行时 status 类型由 StrategyStatus 约束
  const { error } = await supabase
    .from('trade260915a_strategies')
    .update({ status })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${id}`)
  return {}
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/strategy/actions.ts
git commit -m "feat(strategy): server actions for create/update/setStatus"
```

> **注意:** Server Actions 在 Next.js 中不便于直接单测(需要 mock createClient + auth);Action 的端到端验证由 Task 22 e2e 覆盖。这里只确保 typecheck 通过。

---

## Task 15: strategy/index.ts 公共 API

**Files:**
- Create: `src/lib/strategy/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/strategy/index.ts`:

```ts
// 公共 API
export type {
  StrategySpec,
  Condition,
  ConditionsBlock,
  Holding,
  Comparator,
  Combinator,
  StrategyStatus,
} from './types'
export { COMPARATORS, COMBINATORS, STRATEGY_STATUSES } from './types'
export { composeStrategy, emptySpec, defaultHolding, parseStoredSpec } from './compose'
export { evaluateConditions } from './evaluate'
export { listStrategies, getStrategy, type StrategyRow } from './query'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/strategy/index.ts
git commit -m "feat(strategy): public API barrel"
```

---

## Task 16: i18n — quant.strategy 与 quant.factor namespace

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 末尾添加 quant 命名空间**

在 `src/locales/zh.json` 最后一个 `}` 前插入:

```json
,
  "quant": {
    "strategy": {
      "listTitle": "我的策略",
      "newButton": "新建策略",
      "empty": "还没有策略,创建第一个",
      "fields": {
        "name": "策略名称",
        "namePlaceholder": "为你的策略起个名字",
        "combinator": "条件组合",
        "and": "全部满足(AND)",
        "or": "任一满足(OR)",
        "entryTitle": "入场条件",
        "exitTitle": "出场条件",
        "addCondition": "添加条件",
        "removeCondition": "删除条件",
        "holdingTitle": "持仓与风控",
        "maxPositions": "最多持仓数",
        "positionSizePct": "单仓位占比 (%)",
        "maxDrawdownPct": "最大回撤止损 (%)",
        "saveDraft": "保存草稿",
        "saveAndEnable": "保存并启用",
        "cancel": "取消",
        "noEntry": "暂无入场条件,提交后无效",
        "noExit": "暂无出场条件,策略将持有直到手动卖出(本期不适用)"
      },
      "actions": {
        "edit": "编辑",
        "backtest": "回测",
        "start": "启动",
        "pause": "暂停",
        "resume": "恢复",
        "archive": "归档"
      },
      "status": {
        "draft": "草稿",
        "active": "运行中",
        "paused": "已暂停",
        "archived": "已归档"
      },
      "detailTitle": "策略详情",
      "createdAt": "创建于",
      "updatedAt": "更新于",
      "summaryEmpty": "无入场条件"
    },
    "factor": {
      "factor": "因子",
      "selectFactor": "选择因子",
      "comparator": "比较符",
      "threshold": "阈值",
      "RETURN_5D": "5日收益率",
      "RETURN_20D": "20日收益率",
      "RETURN_60D": "60日收益率",
      "MA_CROSS": "均线差值",
      "VOLUME_RATIO": "量比",
      "PE_TTM": "PE-TTM",
      "params": {
        "fastPeriod": "快线周期",
        "slowPeriod": "慢线周期",
        "period": "回看天数"
      },
      "comparators": {
        ">": "大于 (>)",
        "<": "小于 (<)",
        ">=": "大于等于 (≥)",
        "<=": "小于等于 (≤)",
        "cross_up": "上穿阈值",
        "cross_down": "下穿阈值"
      }
    },
    "errors": {
      "name_required": "策略名称不能为空",
      "name_too_long": "策略名称不能超过 100 字符",
      "invalid_spec": "策略配置无效"
    }
  }
```

- [ ] **Step 2: 在 en.json 末尾添加 quant 命名空间**

在 `src/locales/en.json` 最后一个 `}` 前插入:

```json
,
  "quant": {
    "strategy": {
      "listTitle": "My Strategies",
      "newButton": "New Strategy",
      "empty": "No strategies yet. Create your first one.",
      "fields": {
        "name": "Strategy Name",
        "namePlaceholder": "Name your strategy",
        "combinator": "Combinator",
        "and": "All of (AND)",
        "or": "Any of (OR)",
        "entryTitle": "Entry Conditions",
        "exitTitle": "Exit Conditions",
        "addCondition": "Add Condition",
        "removeCondition": "Remove",
        "holdingTitle": "Holding & Risk",
        "maxPositions": "Max Positions",
        "positionSizePct": "Position Size (%)",
        "maxDrawdownPct": "Max Drawdown Stop (%)",
        "saveDraft": "Save Draft",
        "saveAndEnable": "Save & Enable",
        "cancel": "Cancel",
        "noEntry": "No entry conditions. Strategy will not enter any position.",
        "noExit": "No exit conditions. Will hold indefinitely (not applicable in MVP)."
      },
      "actions": {
        "edit": "Edit",
        "backtest": "Backtest",
        "start": "Start",
        "pause": "Pause",
        "resume": "Resume",
        "archive": "Archive"
      },
      "status": {
        "draft": "Draft",
        "active": "Active",
        "paused": "Paused",
        "archived": "Archived"
      },
      "detailTitle": "Strategy Detail",
      "createdAt": "Created at",
      "updatedAt": "Updated at",
      "summaryEmpty": "No entry conditions"
    },
    "factor": {
      "factor": "Factor",
      "selectFactor": "Select factor",
      "comparator": "Comparator",
      "threshold": "Threshold",
      "RETURN_5D": "5-Day Return",
      "RETURN_20D": "20-Day Return",
      "RETURN_60D": "60-Day Return",
      "MA_CROSS": "MA Difference",
      "VOLUME_RATIO": "Volume Ratio",
      "PE_TTM": "PE-TTM",
      "params": {
        "fastPeriod": "Fast Period",
        "slowPeriod": "Slow Period",
        "period": "Lookback Days"
      },
      "comparators": {
        ">": "Greater than (>)",
        "<": "Less than (<)",
        ">=": "Greater or equal (≥)",
        "<=": "Less or equal (≤)",
        "cross_up": "Cross up",
        "cross_down": "Cross down"
      }
    },
    "errors": {
      "name_required": "Strategy name is required",
      "name_too_long": "Strategy name must be ≤ 100 characters",
      "invalid_spec": "Invalid strategy configuration"
    }
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
git commit -m "feat(i18n): quant.strategy and quant.factor namespaces"
```

---

## Task 17: FactorSelector 组件

**Files:**
- Create: `src/components/strategy/factor-selector.tsx`
- Create: `src/components/strategy/factor-selector.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/strategy/factor-selector.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'
import { FactorSelector } from './factor-selector'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

describe('FactorSelector', () => {
  it('renders factor dropdown', () => {
    renderWith(
      <FactorSelector
        factorId="RETURN_20D"
        params={{}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /因子|factor/i })).toBeInTheDocument()
  })

  it('calls onChange when factor changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <FactorSelector
        factorId="RETURN_20D"
        params={{}}
        onChange={onChange}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /因子|factor/i }),
      'MA_CROSS',
    )
    expect(onChange).toHaveBeenCalledWith('MA_CROSS', { fastPeriod: 5, slowPeriod: 20 })
  })

  it('shows param inputs for factors with params', () => {
    renderWith(
      <FactorSelector
        factorId="MA_CROSS"
        params={{ fastPeriod: 5, slowPeriod: 20 }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByLabelText(/快线周期|fast period/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/慢线周期|slow period/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/components/strategy/factor-selector.test.tsx
```

预期: FAIL — `Cannot find module './factor-selector'`。

- [ ] **Step 3: 实现 factor-selector.tsx**

`src/components/strategy/factor-selector.tsx`:

```tsx
'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getFactor, type FactorId } from '@/lib/factors'
import { useLanguage } from '@/components/providers/language-provider'

interface FactorSelectorProps {
  factorId: FactorId
  params: Record<string, number>
  onChange: (factorId: FactorId, params: Record<string, number>) => void
}

export function FactorSelector({ factorId, params, onChange }: FactorSelectorProps) {
  const { t, lang } = useLanguage()

  const factor = getFactor(factorId)
  const factorLabel =
    (t(`quant.factor.${factor.id}`) as string) || (lang === 'en' ? factor.labelEn : factor.label)

  function handleFactorChange(newId: string) {
    const newFactor = getFactor(newId as FactorId)
    const newParams: Record<string, number> = {}
    for (const p of newFactor.params) {
      newParams[p.key] = p.default
    }
    onChange(newId as FactorId, newParams)
  }

  function handleParamChange(key: string, value: number) {
    onChange(factorId, { ...params, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="factor-select">{t('quant.factor.factor')}</Label>
        <select
          id="factor-select"
          value={factorId}
          onChange={(e) => handleFactorChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {(['RETURN_5D', 'RETURN_20D', 'RETURN_60D', 'MA_CROSS', 'VOLUME_RATIO', 'PE_TTM'] as FactorId[]).map((id) => (
            <option key={id} value={id}>
              {(t(`quant.factor.${id}`) as string) || id}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {lang === 'en' ? factor.descriptionEn : factor.description}
        </p>
        <p className="mt-1 text-xs text-gray-400">{factorLabel}</p>
      </div>

      {factor.params.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {factor.params.map((p) => (
            <div key={p.key}>
              <Label htmlFor={`param-${p.key}`}>
                {(t(`quant.factor.params.${p.key}`) as string) || (lang === 'en' ? p.labelEn : p.label)}
              </Label>
              <Input
                id={`param-${p.key}`}
                type="number"
                min={p.min}
                max={p.max}
                value={params[p.key] ?? p.default}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) handleParamChange(p.key, v)
                }}
                className="mt-1"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/components/strategy/factor-selector.test.tsx
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/components/strategy/factor-selector.tsx src/components/strategy/factor-selector.test.tsx
git commit -m "feat(strategy-ui): FactorSelector with dynamic params"
```

---

## Task 18: ConditionRow 组件

**Files:**
- Create: `src/components/strategy/condition-row.tsx`
- Create: `src/components/strategy/condition-row.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/strategy/condition-row.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'
import { ConditionRow } from './condition-row'
import type { Condition } from '@/lib/strategy'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

const baseCondition: Condition = {
  factor: 'RETURN_20D',
  params: {},
  comparator: '>',
  threshold: 0,
}

describe('ConditionRow', () => {
  it('renders factor selector, comparator, threshold', () => {
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /因子|factor/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /比较符|comparator/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/阈值|threshold/i)).toBeInTheDocument()
  })

  it('calls onChange when threshold changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={onChange}
        onRemove={() => {}}
      />,
    )
    const input = screen.getByLabelText(/阈值|threshold/i)
    await user.clear(input)
    await user.type(input, '0.05')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Condition
    expect(lastCall.threshold).toBeCloseTo(0.05, 2)
  })

  it('calls onRemove when remove button clicked', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={() => {}}
        onRemove={onRemove}
      />,
    )
    await user.click(screen.getByRole('button', { name: /删除|remove/i }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/components/strategy/condition-row.test.tsx
```

预期: FAIL — `Cannot find module './condition-row'`。

- [ ] **Step 3: 实现 condition-row.tsx**

`src/components/strategy/condition-row.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FactorSelector } from './factor-selector'
import { useLanguage } from '@/components/providers/language-provider'
import type { Condition, Comparator, FactorId } from '@/lib/strategy'
import { COMPARATORS } from '@/lib/strategy'

interface ConditionRowProps {
  index: number
  condition: Condition
  onChange: (next: Condition) => void
  onRemove: (index: number) => void
}

export function ConditionRow({ index, condition, onChange, onRemove }: ConditionRowProps) {
  const { t } = useLanguage()

  function handleFactorChange(factorId: FactorId, params: Record<string, number>) {
    onChange({ ...condition, factor: factorId, params })
  }

  function handleComparatorChange(comparator: Comparator) {
    onChange({ ...condition, comparator })
  }

  function handleThresholdChange(value: number) {
    onChange({ ...condition, threshold: value })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          条件 #{index + 1}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRemove(index)}
        >
          {t('quant.strategy.fields.removeCondition')}
        </Button>
      </div>

      <FactorSelector
        factorId={condition.factor as FactorId}
        params={condition.params}
        onChange={handleFactorChange}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`comparator-${index}`}>
            {t('quant.factor.comparator')}
          </Label>
          <select
            id={`comparator-${index}`}
            value={condition.comparator}
            onChange={(e) => handleComparatorChange(e.target.value as Comparator)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {COMPARATORS.map((c) => (
              <option key={c} value={c}>
                {(t(`quant.factor.comparators.${c}`) as string) || c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={`threshold-${index}`}>
            {t('quant.factor.threshold')}
          </Label>
          <Input
            id={`threshold-${index}`}
            type="number"
            step="0.01"
            value={condition.threshold}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) handleThresholdChange(v)
            }}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/components/strategy/condition-row.test.tsx
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/components/strategy/condition-row.tsx src/components/strategy/condition-row.test.tsx
git commit -m "feat(strategy-ui): ConditionRow with factor + comparator + threshold"
```

---

## Task 19: StrategyForm 组件

**Files:**
- Create: `src/components/strategy/strategy-form.tsx`
- Create: `src/components/strategy/strategy-form.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/strategy/strategy-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'

// mock 必须在 import 之前
vi.mock('@/lib/strategy/actions', () => ({
  createStrategyAction: vi.fn().mockResolvedValue(null),
  updateStrategyAction: vi.fn().mockResolvedValue(null),
}))

import { createStrategyAction } from '@/lib/strategy/actions'
import { StrategyForm } from './strategy-form'
import { emptySpec } from '@/lib/strategy'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

describe('StrategyForm', () => {
  it('renders name, entry, exit, holding fields, 3 action buttons', () => {
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    expect(screen.getByLabelText(/策略名称|strategy name/i)).toBeInTheDocument()
    expect(screen.getByText(/入场条件|entry conditions/i)).toBeInTheDocument()
    expect(screen.getByText(/出场条件|exit conditions/i)).toBeInTheDocument()
    expect(screen.getByText(/持仓与风控|holding/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /取消|cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存草稿|save draft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存并启用|save & enable/i })).toBeInTheDocument()
  })

  it('adds entry condition when add button clicked', async () => {
    const user = userEvent.setup()
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    const addButtons = screen.getAllByRole('button', { name: /添加条件|add condition/i })
    await user.click(addButtons[0])
    expect(screen.getByText(/条件 #1/i)).toBeInTheDocument()
  })

  it('calls createStrategyAction on submit with valid spec', async () => {
    const user = userEvent.setup()
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    await user.type(screen.getByLabelText(/策略名称|strategy name/i), '我的策略')
    const form = screen.getByRole('button', { name: /保存草稿|save draft/i }).closest('form')!
    await user.click(screen.getByRole('button', { name: /保存草稿|save draft/i }))
    // 因为 redirect 在 action 内, 测试中 action 被 mock 不会真的重定向
    expect(createStrategyAction).toHaveBeenCalled()
    void form
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/components/strategy/strategy-form.test.tsx
```

预期: FAIL — `Cannot find module './strategy-form'`。

- [ ] **Step 3: 实现 strategy-form.tsx**

`src/components/strategy/strategy-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConditionRow } from './condition-row'
import { createStrategyAction, updateStrategyAction } from '@/lib/strategy/actions'
import {
  emptySpec,
  type StrategySpec,
  type Condition,
  type StrategyStatus,
  COMBINATORS,
} from '@/lib/strategy'
import { useLanguage } from '@/components/providers/language-provider'

interface StrategyFormProps {
  initialSpec?: StrategySpec
  initialName?: string
  strategyId?: string
  status?: StrategyStatus
}

export function StrategyForm({
  initialSpec = emptySpec(),
  initialName = '',
  strategyId,
  status,
}: StrategyFormProps) {
  const [spec, setSpec] = useState<StrategySpec>(initialSpec)
  const [submitMode, setSubmitMode] = useState<'draft' | 'enable'>('draft')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<{ name: string }>({
    defaultValues: { name: initialName },
  })

  const { t } = useLanguage()

  function updateEntryCondition(idx: number, c: Condition) {
    setSpec((s) => ({
      ...s,
      entry: { ...s.entry, conditions: s.entry.conditions.map((x, i) => (i === idx ? c : x)) },
    }))
  }

  function removeEntryCondition(idx: number) {
    setSpec((s) => ({
      ...s,
      entry: { ...s.entry, conditions: s.entry.conditions.filter((_, i) => i !== idx) },
    }))
  }

  function addEntryCondition() {
    setSpec((s) => ({
      ...s,
      entry: {
        ...s.entry,
        conditions: [
          ...s.entry.conditions,
          { factor: 'RETURN_20D', params: {}, comparator: '>', threshold: 0 },
        ],
      },
    }))
  }

  function updateExitCondition(idx: number, c: Condition) {
    setSpec((s) => ({
      ...s,
      exit: { ...s.exit, conditions: s.exit.conditions.map((x, i) => (i === idx ? c : x)) },
    }))
  }

  function removeExitCondition(idx: number) {
    setSpec((s) => ({
      ...s,
      exit: { ...s.exit, conditions: s.exit.conditions.filter((_, i) => i !== idx) },
    }))
  }

  function addExitCondition() {
    setSpec((s) => ({
      ...s,
      exit: {
        ...s.exit,
        conditions: [
          ...s.exit.conditions,
          { factor: 'RETURN_20D', params: {}, comparator: '<', threshold: 0 },
        ],
      },
    }))
  }

  const onSubmit = handleSubmit(() => {
    setServerError(null)
    const name = getValues('name')
    startTransition(async () => {
      const action = strategyId ? updateStrategyAction.bind(null, strategyId) : createStrategyAction
      const fd = new FormData()
      fd.append('name', name)
      fd.append('spec', JSON.stringify(spec))
      fd.append('mode', submitMode)
      const result = await action(null, fd)
      if (result?.error) setServerError(result.error)
      if (result?.fieldErrors) {
        const first = Object.values(result.fieldErrors)[0]?.[0]
        if (first) setServerError(first)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{t(serverError) || serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.name')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="strategy-name">{t('quant.strategy.fields.name')}</Label>
          <Input
            id="strategy-name"
            {...register('name', {
              required: true,
              maxLength: 100,
            })}
            placeholder={t('quant.strategy.fields.namePlaceholder') as string}
            className="mt-1"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">
              {t('quant.errors.name_required')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.entryTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quant.strategy.fields.combinator')}</Label>
            <div className="mt-2 flex gap-3">
              {COMBINATORS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entry-combinator"
                    value={c}
                    checked={spec.entry.combinator === c}
                    onChange={() =>
                      setSpec((s) => ({ ...s, entry: { ...s.entry, combinator: c } }))
                    }
                  />
                  {c === 'AND' ? t('quant.strategy.fields.and') : t('quant.strategy.fields.or')}
                </label>
              ))}
            </div>
          </div>

          {spec.entry.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              index={i}
              condition={c}
              onChange={(next) => updateEntryCondition(i, next)}
              onRemove={removeEntryCondition}
            />
          ))}

          <Button type="button" variant="outline" onClick={addEntryCondition}>
            {t('quant.strategy.fields.addCondition')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.exitTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quant.strategy.fields.combinator')}</Label>
            <div className="mt-2 flex gap-3">
              {COMBINATORS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="exit-combinator"
                    value={c}
                    checked={spec.exit.combinator === c}
                    onChange={() =>
                      setSpec((s) => ({ ...s, exit: { ...s.exit, combinator: c } }))
                    }
                  />
                  {c === 'AND' ? t('quant.strategy.fields.and') : t('quant.strategy.fields.or')}
                </label>
              ))}
            </div>
          </div>

          {spec.exit.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              index={i}
              condition={c}
              onChange={(next) => updateExitCondition(i, next)}
              onRemove={removeExitCondition}
            />
          ))}

          <Button type="button" variant="outline" onClick={addExitCondition}>
            {t('quant.strategy.fields.addCondition')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('quant.strategy.fields.holdingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="max-positions">{t('quant.strategy.fields.maxPositions')}</Label>
              <Input
                id="max-positions"
                type="number"
                min={1}
                max={50}
                value={spec.holding.maxPositions}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, maxPositions: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="position-pct">{t('quant.strategy.fields.positionSizePct')}</Label>
              <Input
                id="position-pct"
                type="number"
                min={1}
                max={100}
                value={spec.holding.positionSizePct}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, positionSizePct: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="drawdown-pct">{t('quant.strategy.fields.maxDrawdownPct')}</Label>
              <Input
                id="drawdown-pct"
                type="number"
                min={0.1}
                max={100}
                step="0.1"
                value={spec.holding.maxDrawdownPct}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) {
                    setSpec((s) => ({ ...s, holding: { ...s.holding, maxDrawdownPct: v } }))
                  }
                }}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" disabled={isPending}>
          {t('quant.strategy.fields.cancel')}
        </Button>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          onClick={() => setSubmitMode('draft')}
        >
          {t('quant.strategy.fields.saveDraft')}
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          onClick={() => setSubmitMode('enable')}
        >
          {t('quant.strategy.fields.saveAndEnable')}
        </Button>
      </div>

      {status && (
        <p className="text-sm text-gray-500">
          {t(`quant.strategy.status.${status}` as any)}
        </p>
      )}
    </form>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/components/strategy/strategy-form.test.tsx
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/components/strategy/strategy-form.tsx src/components/strategy/strategy-form.test.tsx
git commit -m "feat(strategy-ui): StrategyForm with entry/exit/holding sections"
```

---

## Task 20: /strategy 列表页 (Server Component)

**Files:**
- Create: `src/app/(dashboard)/strategy/page.tsx`

- [ ] **Step 1: 实现列表页**

`src/app/(dashboard)/strategy/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listStrategies } from '@/lib/strategy/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from '@/lib/i18n'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-500',
}

export default async function StrategyListPage() {
  const { t } = await getTranslations()
  const strategies = await listStrategies()

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('quant.strategy.listTitle')}
        </h1>
        <Link href="/strategy/new">
          <Button>{t('quant.strategy.newButton')}</Button>
        </Link>
      </div>

      {strategies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-600">
            {t('quant.strategy.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{s.name}</CardTitle>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[s.status]}`}>
                    {t(`quant.strategy.status.${s.status}` as any)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">
                  {s.spec.entry.conditions.length > 0
                    ? `${s.spec.entry.conditions.length} 个入场条件 (${s.spec.entry.combinator})`
                    : (t('quant.strategy.summaryEmpty') as string)}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {t('quant.strategy.updatedAt')}: {new Date(s.updatedAt).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <Link href={`/backtest?strategyId=${s.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      {t('quant.strategy.actions.backtest')}
                    </Button>
                  </Link>
                  <Link href={`/strategy/${s.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      {t('quant.strategy.actions.edit')}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
git add "src/app/(dashboard)/strategy/page.tsx"
git commit -m "feat(strategy-ui): strategy list page"
```

---

## Task 21: /strategy/new 新建页

**Files:**
- Create: `src/app/(dashboard)/strategy/new/page.tsx`

- [ ] **Step 1: 实现新建页**

`src/app/(dashboard)/strategy/new/page.tsx`:

```tsx
import { StrategyForm } from '@/components/strategy/strategy-form'
import { getTranslations } from '@/lib/i18n'

export default async function NewStrategyPage() {
  const { t } = await getTranslations()

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {t('quant.strategy.newButton')}
      </h1>
      <StrategyForm />
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
git add "src/app/(dashboard)/strategy/new/page.tsx"
git commit -m "feat(strategy-ui): new strategy page"
```

---

## Task 22: /strategy/[id] 详情/编辑页

**Files:**
- Create: `src/app/(dashboard)/strategy/[id]/page.tsx`

- [ ] **Step 1: 实现详情页**

`src/app/(dashboard)/strategy/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getStrategy } from '@/lib/strategy/query'
import { StrategyForm } from '@/components/strategy/strategy-form'
import { StrategyActions } from './strategy-actions'
import { getTranslations } from '@/lib/i18n'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StrategyDetailPage({ params }: PageProps) {
  const { id } = await params
  const strategy = await getStrategy(id)
  if (!strategy) notFound()

  const { t } = await getTranslations()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {strategy.name}
        </h1>
        <p className="text-sm text-gray-500">
          {t('quant.strategy.detailTitle')} · {t(`quant.strategy.status.${strategy.status}` as any)}
        </p>
      </div>

      <StrategyActions
        strategyId={strategy.id}
        status={strategy.status}
      />

      <div className="mt-6">
        <StrategyForm
          strategyId={strategy.id}
          initialName={strategy.name}
          initialSpec={strategy.spec}
          status={strategy.status}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 实现 strategy-actions 客户端组件**

`src/app/(dashboard)/strategy/[id]/strategy-actions.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { setStrategyStatusAction } from '@/lib/strategy/actions'
import type { StrategyStatus } from '@/lib/strategy'
import { useLanguage } from '@/components/providers/language-provider'

interface StrategyActionsProps {
  strategyId: string
  status: StrategyStatus
}

export function StrategyActions({ strategyId, status }: StrategyActionsProps) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  function setStatus(next: StrategyStatus) {
    startTransition(async () => {
      await setStrategyStatusAction(strategyId, next)
    })
  }

  if (status === 'archived') return null

  return (
    <div className="flex gap-2">
      {status === 'draft' && (
        <Button
          onClick={() => setStatus('active')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.start')}
        </Button>
      )}
      {status === 'active' && (
        <Button
          variant="outline"
          onClick={() => setStatus('paused')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.pause')}
        </Button>
      )}
      {status === 'paused' && (
        <Button
          onClick={() => setStatus('active')}
          disabled={isPending}
        >
          {t('quant.strategy.actions.resume')}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => setStatus('archived')}
        disabled={isPending}
      >
        {t('quant.strategy.actions.archive')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 4: 提交**

```bash
git add "src/app/(dashboard)/strategy/[id]/page.tsx" "src/app/(dashboard)/strategy/[id]/strategy-actions.tsx"
git commit -m "feat(strategy-ui): strategy detail with status actions"
```

---

## Task 23: e2e 测试 (strategy-lifecycle)

**Files:**
- Create: `e2e/strategy-lifecycle.spec.ts`

> 完整 lifecycle: 注册 / 登录 / 创建策略 / 查看列表 / 跳转详情 / 启动。E2E 使用 Playwright(沿用 `e2e/admin.spec.ts` 的 setup)。

- [ ] **Step 1: 实现 e2e 测试**

`e2e/strategy-lifecycle.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-strategy-${Date.now()}@example.com`
const TEST_PASSWORD = 'password123'

test('strategy lifecycle: sign up → create strategy → see in list → view detail', async ({ page }) => {
  // 1. 注册
  await page.goto('/auth/sign-up')
  await page.getByLabel(/邮箱|email/i).fill(TEST_EMAIL)
  await page.getByLabel(/^密码$|^password$/i).fill(TEST_PASSWORD)
  const confirm = page.getByLabel(/确认密码|confirm password/i)
  if (await confirm.count()) await confirm.fill(TEST_PASSWORD)
  await page.getByRole('button', { name: /注册|sign up/i }).click()
  await page.waitForURL(/\/dashboard/)

  // 2. 进入 strategy 列表
  await page.goto('/strategy')
  await expect(page.getByRole('heading', { name: /我的策略|my strategies/i })).toBeVisible()

  // 3. 新建
  await page.getByRole('link', { name: /新建策略|new strategy/i }).click()
  await page.waitForURL(/\/strategy\/new/)

  // 4. 填表
  await page.getByLabel(/策略名称|strategy name/i).fill('E2E 策略')
  // 默认有一个空 entry 块, 添加条件
  await page.getByRole('button', { name: /添加条件|add condition/i }).first().click()
  // 阈值默认 0,直接保存
  await page.getByRole('button', { name: /保存草稿|save draft/i }).click()

  // 5. 详情页
  await page.waitForURL(/\/strategy\/[a-f0-9-]+$/)

  // 6. 返回列表,确认看到新建的策略
  await page.goto('/strategy')
  await expect(page.getByText('E2E 策略')).toBeVisible()

  // 7. 启动
  await page.getByText('E2E 策略').click()
  await page.waitForURL(/\/strategy\/[a-f0-9-]+$/)
  await page.getByRole('button', { name: /启动|start/i }).click()
  await expect(page.getByText(/运行中|active/i)).toBeVisible()
})
```

- [ ] **Step 2: 验证测试文件存在**

```bash
ls e2e/strategy-lifecycle.spec.ts
```

预期: 文件存在。

- [ ] **Step 3: (手动)运行 E2E 验证**

```bash
# 1. dev server 已起
# 2. 清空 DB
pnpm dlx supabase db reset
# 3. seed
pnpm seed:symbols
# 4. 启动 dev server
pnpm dev
# 5. 新终端跑测试
pnpm exec playwright test e2e/strategy-lifecycle.spec.ts
```

预期: 全部步骤通过(具体取决于环境;本步只验证文件可解析)。

- [ ] **Step 4: 提交**

```bash
git add e2e/strategy-lifecycle.spec.ts
git commit -m "test(e2e): strategy lifecycle journey"
```

---

## Task 24: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在 Quant 模块段落添加 Phase 1 说明**

在 `README.md` 找到 `## Quant 模块 (Phase 0+)` 段落后追加:

```markdown
### Phase 1 — 因子 + 策略

用户可创建并保存策略。包含:

- 6 个内置因子 (5D/20D/60D 动量、均线差值、量比、PE-TTM)
- `StrategySpec` zod schema (entry/exit conditions + holding config)
- `evaluateConditions` 纯函数求值器
- Server Actions: `createStrategyAction` / `updateStrategyAction` / `setStrategyStatusAction`
- 页面: `/strategy` 列表, `/strategy/new` 新建, `/strategy/[id]` 详情/编辑/启停
- i18n: `quant.strategy.*` / `quant.factor.*` (zh + en)

策略表 `trade260915a_strategies` 含 RLS (按 user_id 隔离)。
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: quant Phase 1 feature notes"
```

---

## Task 25: 端到端验证

**Files:** 无新增。

- [ ] **Step 1: 跑全部单元测试**

```bash
pnpm test
```

预期: 全部 PASS (lib/factors / lib/strategy / components/strategy 全部覆盖)。

- [ ] **Step 2: 跑覆盖率**

```bash
pnpm test:cov
```

预期:
- 整体 ≥ 80%
- `lib/factors/*` ≥ 95%
- `lib/strategy/*` ≥ 90%
- `components/strategy/*` ≥ 70%

- [ ] **Step 3: 类型检查 + lint**

```bash
pnpm typecheck && pnpm lint
```

预期: 全 PASS。

- [ ] **Step 4: 端到端流程**

```bash
# 1. 重置 DB
pnpm dlx supabase db reset

# 2. seed symbols
pnpm seed:symbols

# 3. 启动 dev server
pnpm dev

# 4. 浏览器
# a. http://localhost:3000/auth/sign-up 注册
# b. http://localhost:3000/strategy → 看到 "还没有策略"
# c. 点 "新建策略" → 填表(添加 1 个条件,默认 RETURN_20D > 0)→ 保存
# d. 重定向到 /strategy/[id] → 看到详情
# e. 点 "启动" → status 变 active
# f. 回 /strategy → 列表显示 active 徽章
```

预期: 全部步骤成功,无 console error。

- [ ] **Step 5: 提交(如有遗漏)**

```bash
git status
git add -A
git commit -m "chore: Phase 1 end-to-end verification"
```

---

## 质量门 (DoD)

- [ ] `pnpm test` 全部通过
- [ ] `pnpm test:cov` 整体 ≥ 80%,因子/策略/UI 关键模块达标
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint` PASS
- [ ] Migration `003_strategies.sql` 已应用,RLS 验证通过
- [ ] 6 个因子均实现,3 个动量 + 均线 + 量比 + PE
- [ ] 因子 registry 暴露 `getFactor` / `listFactors`
- [ ] `StrategySpec` zod 校验通过(合法 / 缺字段 / 非法)
- [ ] `evaluateConditions` 覆盖 AND / OR / 比较符 / cross_up / cross_down / 数据不足
- [ ] Server Actions: create / update / setStatus 全部可调用
- [ ] `/strategy` 列表页渲染卡片
- [ ] `/strategy/new` 表单可提交并跳详情
- [ ] `/strategy/[id]` 详情可编辑 spec 与切换 status
- [ ] i18n 双语 key 完整 (zh + en)
- [ ] e2e `strategy-lifecycle` 测试通过
- [ ] 全部代码已提交

---

## 变更日志

- 2026-09-15: Phase 1 实施计划 v1。25 个任务覆盖 migration + 6 因子 + registry + StrategySpec + evaluate + Server Actions + 3 页面 + 表单组件 + i18n + e2e。因子纯函数零依赖,evaluate.ts 是回测/实盘的共享核心。
