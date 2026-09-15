# Quant Trading Phase 0 — Schema + 数据层 Mock — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 A 股量化交易系统的数据基础 — 创建行情表 + RLS,实现 `MarketDataProvider` 接口与 Mock 实现,提供 ingest/query 工具与交易日 / 时段工具,配置 Vercel Cron 增量入库端点,并完成 `/market` 与 `/market/[symbol]` 两个页面让用户能从浏览器看到 K 线。

**Architecture:** 模块化单体,领域层 (`src/lib/data`, `src/lib/scheduler`) 纯 TS 无 `next/*` 依赖,可独立单测。Supabase Postgres 提供行情持久化 (按 trade_date 月份分区)。Cron 端点只编排,业务逻辑在 `lib/`。Mock 数据用确定性伪随机 (seed = symbolCode),接口与未来 Tushare 实现一致。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · `@supabase/ssr` + `@supabase/supabase-js` · Vitest · @testing-library/react · pnpm · `lightweight-charts` (本期引入,用于 K 线)

**Spec:** `docs/superpowers/specs/2026-09-15-quant-trading-design.md`

---

## 全局前置

- [ ] 仓库在 `/Users/samhooxee/dev/web/trade`,分支 `main`,已是干净工作区
- [ ] `node -v` ≥ 20.18,`pnpm -v` ≥ 9
- [ ] 已 `pnpm install` 完毕
- [ ] `.env.local` 含有有效的 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] 本地 Supabase 已启动 (`pnpm dlx supabase start`) 或远程 project 可用

> **Git 提醒:** 每个 Task 末尾独立提交,粒度细,便于回滚 / code review。
>
> **表名前缀约定:** 本期所有新增数据库表统一前缀 `trade260915a_`,由用户在 spec 评审时确认。
>
> **轻量图表库时机说明:** Spec §9 注明 lightweight-charts 在 Phase 2 引入,但 Phase 0 DoD 要求 `/market/[symbol]` 显示 K 线。为满足 DoD,本计划在 Phase 0 引入 `lightweight-charts`,Phase 2 直接复用即可。

---

## Task 1: 数据库 Schema + RLS Migration

**Files:**
- Create: `supabase/migrations/002_quant_schema.sql`

- [ ] **Step 1: 创建 migration 文件**

`supabase/migrations/002_quant_schema.sql`:

```sql
-- 002_quant_schema.sql
-- 行情数据 schema。所有表带 trade260915a_ 前缀。

-- 股票元数据
CREATE TABLE trade260915a_quant_symbols (
  code         TEXT PRIMARY KEY,             -- "600000"
  market       TEXT NOT NULL CHECK (market IN ('SH', 'SZ')),
  name         TEXT NOT NULL,
  list_date    DATE NOT NULL,
  delist_date  DATE,
  is_mainboard BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 日线 (按月分区)
CREATE TABLE trade260915a_quant_daily_bars (
  symbol_code TEXT NOT NULL,
  trade_date  DATE NOT NULL,
  open        NUMERIC(12, 4) NOT NULL,
  high        NUMERIC(12, 4) NOT NULL,
  low         NUMERIC(12, 4) NOT NULL,
  close       NUMERIC(12, 4) NOT NULL,
  volume      BIGINT NOT NULL,
  amount      BIGINT NOT NULL,
  PRIMARY KEY (symbol_code, trade_date)
) PARTITION BY RANGE (trade_date);

-- 2025 年分区
CREATE TABLE trade260915a_quant_daily_bars_2025 PARTITION OF trade260915a_quant_daily_bars
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 2026 年分区
CREATE TABLE trade260915a_quant_daily_bars_2026 PARTITION OF trade260915a_quant_daily_bars
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 分钟线 (按月分区, 与日线同构 + trade_time)
CREATE TABLE trade260915a_quant_minute_bars (
  symbol_code TEXT NOT NULL,
  trade_date  DATE NOT NULL,
  trade_time  TIMESTAMPTZ NOT NULL,
  open        NUMERIC(12, 4) NOT NULL,
  high        NUMERIC(12, 4) NOT NULL,
  low         NUMERIC(12, 4) NOT NULL,
  close       NUMERIC(12, 4) NOT NULL,
  volume      BIGINT NOT NULL,
  amount      BIGINT NOT NULL,
  PRIMARY KEY (symbol_code, trade_time)
) PARTITION BY RANGE (trade_date);

CREATE TABLE trade260915a_quant_minute_bars_2025 PARTITION OF trade260915a_quant_minute_bars
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE trade260915a_quant_minute_bars_2026 PARTITION OF trade260915a_quant_minute_bars
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 数据同步状态 (用于增量入库的游标)
CREATE TABLE trade260915a_quant_ingest_state (
  data_type       TEXT PRIMARY KEY CHECK (data_type IN ('daily', 'minute')),
  last_synced_at  TIMESTAMPTZ NOT NULL
);

-- 初始化同步状态
INSERT INTO trade260915a_quant_ingest_state (data_type, last_synced_at) VALUES
  ('daily',  '1970-01-01 00:00:00+00'),
  ('minute', '1970-01-01 00:00:00+00');

-- ============ RLS ============
-- 行情数据所有登录用户可读,只有 service_role 可写。

ALTER TABLE trade260915a_quant_symbols       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_daily_bars    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_minute_bars   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_ingest_state  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read symbols"     ON trade260915a_quant_symbols
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read daily"       ON trade260915a_quant_daily_bars
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read minute"      ON trade260915a_quant_minute_bars
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read ingest"      ON trade260915a_quant_ingest_state
  FOR SELECT TO authenticated USING (true);

-- 写权限仅 service_role (cron 用),authenticated 无写权限。
-- 不显式 grant 默认就是无权限。
```

- [ ] **Step 2: 应用 migration 到本地 Supabase**

```bash
pnpm dlx supabase db reset
# 或: pnpm dlx supabase migration up
```

预期: 命令成功,无错误输出。

- [ ] **Step 3: 验证表与分区已创建**

```bash
pnpm dlx supabase db psql --local -c "\d+ trade260915a_quant_daily_bars"
pnpm dlx supabase db psql --local -c "SELECT count(*) FROM trade260915a_quant_ingest_state"
```

预期: 第一个命令显示分区表结构 (含 `_2025`, `_2026`)。第二个命令返回 `2` (两条初始 state 记录)。

- [ ] **Step 4: 验证 RLS**

```bash
pnpm dlx supabase db psql --local -c "
  SET ROLE authenticated;
  SELECT count(*) FROM trade260915a_quant_symbols;
  INSERT INTO trade260915a_quant_symbols (code, market, name, list_date) VALUES ('999999', 'SH', 'TEST', '2025-01-01');
"
```

预期: 第一条 SELECT 返回 0 (authenticated 角色没有数据),第二条 INSERT 报 RLS 错误 (`new row violates row-level security policy`)。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/002_quant_schema.sql
git commit -m "feat(db): quant schema migration with RLS"
```

---

## Task 2: MarketDataProvider 接口与类型

**Files:**
- Create: `src/lib/data/provider.ts`
- Create: `src/lib/data/provider.test.ts`

- [ ] **Step 1: 写失败的类型 / 形状测试**

`src/lib/data/provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { DailyBar, MinuteBar, Symbol } from './provider'

describe('provider types', () => {
  it('Symbol shape', () => {
    const s: Symbol = {
      code: '600000',
      market: 'SH',
      name: '浦发银行',
      listDate: '1999-11-10',
      delistDate: null,
    }
    expect(s.code).toBe('600000')
    expect(s.market).toMatch(/^(SH|SZ)$/)
  })

  it('DailyBar shape', () => {
    const b: DailyBar = {
      symbolCode: '600000',
      tradeDate: '2026-09-15',
      open: 10.5,
      high: 10.8,
      low: 10.2,
      close: 10.6,
      volume: 1_000_000,
      amount: 10_600_000,
    }
    expect(b.symbolCode).toBe('600000')
    expect(b.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(b.high).toBeGreaterThanOrEqual(b.low)
  })

  it('MinuteBar shape', () => {
    const b: MinuteBar = {
      symbolCode: '600000',
      tradeDate: '2026-09-15',
      tradeTime: '2026-09-15T01:31:00Z',
      open: 10.5,
      high: 10.8,
      low: 10.2,
      close: 10.6,
      volume: 50_000,
      amount: 530_000,
    }
    expect(b.tradeTime).toMatch(/T/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/data/provider.test.ts
```

预期: FAIL — `Cannot find module './provider'` 或找不到类型。

- [ ] **Step 3: 实现接口与类型**

`src/lib/data/provider.ts`:

```ts
// 行情数据接口。所有实现 (Mock / Tushare / AkShare) 必须满足这个形状。

export type Market = 'SH' | 'SZ'

export interface Symbol {
  /** 6 位股票代码,如 "600000" */
  code: string
  /** 交易所 */
  market: Market
  /** 中文名 */
  name: string
  /** 上市日期, ISO date string */
  listDate: string
  /** 退市日期,未退市为 null */
  delistDate: string | null
}

export interface DailyBar {
  symbolCode: string
  /** "YYYY-MM-DD" */
  tradeDate: string
  open: number
  high: number
  low: number
  close: number
  /** 股数 */
  volume: number
  /** 元 */
  amount: number
}

export interface MinuteBar {
  symbolCode: string
  /** "YYYY-MM-DD" */
  tradeDate: string
  /** ISO datetime,UTC */
  tradeTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number
}

export interface MarketDataProvider {
  /** 返回所有主板股票 (含已退市) */
  listSymbols(): Promise<Symbol[]>

  /** 历史日线,闭区间 [from, to] */
  getDailyBars(symbolCode: string, from: string, to: string): Promise<DailyBar[]>

  /** 历史分钟线,闭区间 [from, to] */
  getMinuteBars(symbolCode: string, from: string, to: string): Promise<MinuteBar[]>

  /** 增量日线,since 之后的所有日线 (含 since 当日) */
  getDailyBarsSince(symbolCode: string, since: string): Promise<DailyBar[]>

  /** 增量分钟线,since 之后的所有分钟线 (含 since) */
  getMinuteBarsSince(symbolCode: string, since: string): Promise<MinuteBar[]>
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/data/provider.test.ts
```

预期: PASS, 3 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/data/provider.ts src/lib/data/provider.test.ts
git commit -m "feat(data): MarketDataProvider interface and types"
```

---

## Task 3: MockDataProvider 实现

**Files:**
- Create: `src/lib/data/adapters/mock.ts`
- Create: `src/lib/data/adapters/mock.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/data/adapters/mock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MockDataProvider } from './mock'

describe('MockDataProvider', () => {
  const provider = new MockDataProvider()

  it('listSymbols returns mainboard symbols', async () => {
    const symbols = await provider.listSymbols()
    expect(symbols.length).toBeGreaterThan(30)
    for (const s of symbols) {
      expect(s.code).toMatch(/^(60[0-9]{4}|00[0-9]{4}|001[0-9]{3}|002[0-9]{3}|003[0-9]{3})$/)
      expect(['SH', 'SZ']).toContain(s.market)
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.delistDate).toBeNull()
    }
  })

  it('listSymbols is deterministic', async () => {
    const a = await provider.listSymbols()
    const b = await provider.listSymbols()
    expect(a[0]).toEqual(b[0])
  })

  it('getDailyBars returns ascending dates', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    expect(bars.length).toBeGreaterThan(0)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].tradeDate > bars[i - 1].tradeDate).toBe(true)
    }
    expect(bars[0].symbolCode).toBe('600000')
  })

  it('getDailyBars skips weekends', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-04', '2025-01-10') // 含周六周日
    for (const b of bars) {
      const day = new Date(b.tradeDate).getUTCDay()
      expect(day).not.toBe(0) // Sunday
      expect(day).not.toBe(6) // Saturday
    }
  })

  it('getDailyBars respects mainboard ±10% limit', async () => {
    const bars = await provider.getDailyBars('600000', '2025-01-06', '2025-06-30')
    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1].close
      const open = bars[i].open
      const ratio = (open - prev) / prev
      // 允许 ±10% 加 0.01% 浮点容忍
      expect(Math.abs(ratio)).toBeLessThanOrEqual(0.1001)
    }
  })

  it('getDailyBars is deterministic for same input', async () => {
    const a = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    const b = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    expect(a).toEqual(b)
  })

  it('getDailyBarsSince returns bars from since onwards', async () => {
    const bars = await provider.getDailyBarsSince('600000', '2025-06-01')
    expect(bars.length).toBeGreaterThan(0)
    for (const b of bars) {
      expect(b.tradeDate >= '2025-06-01').toBe(true)
    }
  })

  it('getMinuteBars returns 240 bars per trading day', async () => {
    const bars = await provider.getMinuteBars('600000', '2025-01-06', '2025-01-06')
    expect(bars.length).toBe(240) // 9:30-11:30 (120) + 13:00-15:00 (120)
    for (const b of bars) {
      expect(b.tradeDate).toBe('2025-01-06')
      expect(b.symbolCode).toBe('600000')
    }
  })

  it('different symbols generate different prices (seed differs)', async () => {
    const a = await provider.getDailyBars('600000', '2025-01-06', '2025-01-10')
    const b = await provider.getDailyBars('600036', '2025-01-06', '2025-01-10')
    expect(a[0].close).not.toBe(b[0].close)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/data/adapters/mock.test.ts
```

预期: FAIL — `Cannot find module './mock'`。

- [ ] **Step 3: 实现 MockDataProvider**

`src/lib/data/adapters/mock.ts`:

```ts
import type { DailyBar, MarketDataProvider, MinuteBar, Symbol } from '../provider'

/**
 * Mock 数据 provider。用确定性伪随机 (seed = symbolCode) 生成与 A 股形态
 * 相似但非真实的数据,仅用于本地开发与测试。
 *
 * 价格模型: 几何布朗运动 (drift 0.05%/日, vol 2%/日),开盘跳空。
 * 主板 ±10% 涨跌停限制硬约束。
 * 数据完全确定性: 相同输入永远返回相同输出。
 */

const TRADING_HOURS_UTC = [
  // 9:30-11:30 北京 = 1:30-3:30 UTC
  { start: { h: 1, m: 31 }, end: { h: 3, m: 30 }, count: 120 },
  // 13:00-15:00 北京 = 5:00-7:00 UTC
  { start: { h: 5, m: 1 }, end: { h: 7, m: 0 }, count: 120 },
]

const HOLIDAYS_2025 = new Set([
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-07',
  '2025-05-01', '2025-05-02', '2025-05-05',
  '2025-05-31', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
])

const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02',
  '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
])

function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  if (HOLIDAYS_2025.has(dateStr) || HOLIDAYS_2026.has(dateStr)) return false
  return true
}

function enumerateTradingDays(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    if (isTradingDay(dateStr)) result.push(dateStr)
  }
  return result
}

/** 简单 seeded RNG (Mulberry32 变体,字符串 hash → seed) */
function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 标准正态分布采样 (Box-Muller 简化) */
function randNormal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9)
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** 主板代码集合 (沪 6xxxxx + 深 00xxxxx / 002xxx / 003xxx) */
function enumerateMainboardCodes(): string[] {
  const codes: string[] = []
  // 沪市主板 600000-601999 (2000), 603000-603999 (1000)
  for (let i = 0; i < 2000; i++) codes.push('6' + String(i).padStart(5, '0'))
  for (let i = 3000; i < 4000; i++) codes.push('6' + String(i).padStart(5, '0'))
  // 深市主板 000001-001999 (1999), 002001-002999 (999), 003001-003999 (999)
  for (let i = 1; i < 2000; i++) codes.push('0' + String(i).padStart(5, '0'))
  for (let i = 2001; i < 3000; i++) codes.push('0' + String(i).padStart(5, '0'))
  for (let i = 3001; i < 4000; i++) codes.push('0' + String(i).padStart(5, '0'))
  return codes
}

const MAINBOARD_CODES = enumerateMainboardCodes()

const SAMPLE_NAMES = [
  '浦发银行', '招商银行', '兴业银行', '中信证券', '贵州茅台', '五粮液', '中国平安',
  '万科A', '保利发展', '海螺水泥', '宝钢股份', '中国石化', '中国石油', '上汽集团',
  '中国神华', '长江电力', '美的集团', '格力电器', '海尔智家', '伊利股份',
]

export class MockDataProvider implements MarketDataProvider {
  async listSymbols(): Promise<Symbol[]> {
    return MAINBOARD_CODES.map((code, i) => {
      const market = code.startsWith('6') ? 'SH' : 'SZ'
      const rand = seededRandom('name:' + code)
      const name = SAMPLE_NAMES[Math.floor(rand() * SAMPLE_NAMES.length)]
      return {
        code,
        market,
        name,
        listDate: '1999-01-01',
        delistDate: null,
      }
    })
  }

  async getDailyBars(symbolCode: string, from: string, to: string): Promise<DailyBar[]> {
    const dates = enumerateTradingDays(from, to)
    return dates.map((date) => this.makeDailyBar(symbolCode, date))
  }

  async getMinuteBars(symbolCode: string, from: string, to: string): Promise<MinuteBar[]> {
    const dates = enumerateTradingDays(from, to)
    const result: MinuteBar[] = []
    for (const date of dates) {
      result.push(...this.makeMinuteBars(symbolCode, date))
    }
    return result
  }

  async getDailyBarsSince(symbolCode: string, since: string): Promise<DailyBar[]> {
    const today = new Date().toISOString().slice(0, 10)
    return this.getDailyBars(symbolCode, since, today)
  }

  async getMinuteBarsSince(symbolCode: string, since: string): Promise<MinuteBar[]> {
    const today = new Date().toISOString().slice(0, 10)
    return this.getMinuteBars(symbolCode, since, today)
  }

  private makeDailyBar(symbolCode: string, date: string): DailyBar {
    const rand = seededRandom(`${symbolCode}:${date}`)
    const prevClose = this.previousCloseFor(symbolCode, date)

    // GBM 跳空 + 收盘
    const drift = 0.0005
    const vol = 0.02
    const gap = (rand() - 0.5) * 0.04 // ±2% 跳空
    const openRatio = 1 + gap
    let open = prevClose * openRatio
    // 涨跌停钳制
    open = this.applyLimit(open, prevClose)
    const closeRand = randNormal(rand)
    let close = open * Math.exp(drift - 0.5 * vol * vol + vol * closeRand)
    close = this.applyLimit(close, prevClose)

    const high = Math.max(open, close) * (1 + Math.abs(randNormal(rand)) * 0.005)
    const low = Math.min(open, close) * (1 - Math.abs(randNormal(rand)) * 0.005)

    const volume = Math.floor(1_000_000 + rand() * 9_000_000)
    const amount = Math.floor(volume * (open + close) / 2)

    return {
      symbolCode,
      tradeDate: date,
      open: round4(open),
      high: round4(high),
      low: round4(low),
      close: round4(close),
      volume,
      amount,
    }
  }

  private makeMinuteBars(symbolCode: string, date: string): MinuteBar[] {
    const dayBar = this.makeDailyBar(symbolCode, date)
    const result: MinuteBar[] = []
    let prevClose = (dayBar.open + dayBar.close) / 2

    for (const session of TRADING_HOURS_UTC) {
      for (let i = 0; i < session.count; i++) {
        const minutes = session.start.m + i
        const h = session.start.h + Math.floor(minutes / 60)
        const m = minutes % 60
        const tradeTime = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

        const rand = seededRandom(`${symbolCode}:${tradeTime}`)
        const drift = 0.00001
        const vol = 0.001
        const close = prevClose * Math.exp(drift - 0.5 * vol * vol + vol * randNormal(rand))
        const open = prevClose
        const high = Math.max(open, close) * (1 + Math.abs(randNormal(rand)) * 0.001)
        const low = Math.min(open, close) * (1 - Math.abs(randNormal(rand)) * 0.001)
        const volume = Math.floor(5_000 + rand() * 50_000)

        result.push({
          symbolCode,
          tradeDate: date,
          tradeTime,
          open: round4(open),
          high: round4(high),
          low: round4(low),
          close: round4(close),
          volume,
          amount: Math.floor(volume * (open + close) / 2),
        })
        prevClose = close
      }
    }
    return result
  }

  private previousCloseFor(symbolCode: string, date: string): number {
    const prevDate = this.tradingDayBefore(date)
    const rand = seededRandom(`${symbolCode}:${prevDate}`)
    return 10 + rand() * 50 // 10-60 元随机基础价
  }

  private tradingDayBefore(date: string): string {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    let s = d.toISOString().slice(0, 10)
    while (!isTradingDay(s)) {
      d.setUTCDate(d.getUTCDate() - 1)
      s = d.toISOString().slice(0, 10)
    }
    return s
  }

  private applyLimit(price: number, prevClose: number): number {
    const upper = prevClose * 1.10
    const lower = prevClose * 0.90
    return Math.max(lower, Math.min(upper, price))
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/data/adapters/mock.test.ts
```

预期: PASS, 9 tests。注意 listSymbols 返回 ~6000 个,测试用 `toBeGreaterThan(30)` 而非精确数。

- [ ] **Step 5: 提交**

```bash
git add src/lib/data/adapters/mock.ts src/lib/data/adapters/mock.test.ts
git commit -m "feat(data): MockDataProvider with deterministic GBM"
```

---

## Task 4: data/adapters/README.md (真实数据源接入指南)

**Files:**
- Create: `src/lib/data/adapters/README.md`

- [ ] **Step 1: 写 README**

`src/lib/data/adapters/README.md`:

```markdown
# 行情数据适配器

本目录包含 `MarketDataProvider` 的所有实现。生产环境通过 `MARKET_DATA_PROVIDER` 环境变量切换。

## 当前实现

| Provider | 环境变量值 | 状态 |
|---|---|---|
| MockDataProvider | (默认, 或 `mock`) | ✅ 已实现, 用于本地开发与测试 |
| TushareDataProvider | `tushare` | 🚧 待实现 |
| AkShareDataProvider | `akshare` | 🚧 待实现 |

## 接入新数据源

实现 `MarketDataProvider` 接口,放在 `adapters/<name>.ts`,然后在 `src/lib/data/index.ts` 的 `getProvider()` 工厂中添加分支。

```ts
import type { MarketDataProvider } from '../provider'

export class MyProvider implements MarketDataProvider {
  async listSymbols(): Promise<Symbol[]> {
    // 调用数据源 API,转换为你接口的形状
  }
  // ... 其他方法
}
```

数据源 API 通常返回的数据形状不同,需要做字段映射和单位换算 (例如: 成交量是"手"还是"股")。

## Mock 数据使用注意

Mock 数据由 GBM 模型生成,与真实 A 股**形态相似但非真实数据**。Mock 数据用于:
- 本地开发 UI
- 单元测试与 E2E 测试
- 演示

Mock 数据**不可用于实际投资决策**。生产环境务必切换到真实数据源。
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/data/adapters/README.md
git commit -m "docs(data): adapter extension guide"
```

---

## Task 5: service-role supabase 客户端

**Files:**
- Create: `src/lib/supabase/service-role.ts`

> **为什么提前:** Phase 0 中 `ingest.ts` 与 cron 端点都需要写数据库,但行情表 RLS 只允许 `authenticated` 读。**写权限必须 service_role**。所以 service-role 客户端必须在 ingest 任务之前定义。

- [ ] **Step 1: 实现 service-role client**

`src/lib/supabase/service-role.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

/**
 * service-role client。绕过 RLS,仅用于服务端 cron / 后台任务 / 测试。
 * 严禁在浏览器或 Server Component 内调用 — 会泄露 service_role key。
 */

let cached: ReturnType<typeof createClient> | null = null

export function getServiceRoleClient() {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cached
}
```

- [ ] **Step 2: 在 `.env.local` 添加 service_role key**

(本地开发,从 Supabase Dashboard → Project Settings → API → service_role secret 复制)

```bash
echo "SUPABASE_SERVICE_ROLE_KEY=ey..." >> .env.local
```

- [ ] **Step 3: 确认 `.env.local` 已在 .gitignore**

```bash
grep -q "^\.env\.local$" .gitignore && echo "ok" || echo ".env.local" >> .gitignore
```

- [ ] **Step 4: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/supabase/service-role.ts
git commit -m "feat(supabase): service-role client for cron jobs and ingest"
```

---

## Task 6: data/ingest.ts (upsert 逻辑)

**Files:**
- Create: `src/lib/data/ingest.ts`
- Create: `src/lib/data/ingest.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/data/ingest.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import { ingestDailyBars, ingestMinuteBars, getLastSyncedAt, setLastSyncedAt } from './ingest'

// 这些测试需要本地 Supabase 运行。CI 用 ephemeral Postgres。
const skipIfNoDb = process.env.SUPABASE_URL ? describe : describe.skip

skipIfNoDb('ingest', () => {
  beforeEach(async () => {
    const supabase = getServiceRoleClient()
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_ingest_state').update({ last_synced_at: '1970-01-01T00:00:00Z' })
      .in('data_type', ['daily', 'minute'])
  })

  afterEach(async () => {
    const supabase = getServiceRoleClient()
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
  })

  it('ingestDailyBars inserts new bars', async () => {
    const result = await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
      { symbolCode: '600000', tradeDate: '2026-09-16', open: 10.5, high: 11.2, low: 10.3, close: 10.8, volume: 1200, amount: 12960 },
    ])
    expect(result.upserted).toBe(2)
  })

  it('ingestDailyBars updates existing bar (upsert)', async () => {
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
    ])
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', open: 10, high: 11, low: 9.5, close: 10.6, volume: 1000, amount: 10600 },
    ])
    const supabase = getServiceRoleClient()
    const { data } = await supabase.from('trade260915a_quant_daily_bars')
      .select('close, amount')
      .eq('symbol_code', '600000')
      .eq('trade_date', '2026-09-15')
      .single()
    expect(data?.close).toBe('10.6000')
    expect(data?.amount).toBe('10600')
  })

  it('ingestMinuteBars inserts new bars', async () => {
    const result = await ingestMinuteBars([
      { symbolCode: '600000', tradeDate: '2026-09-15', tradeTime: '2026-09-15T01:31:00Z', open: 10, high: 10.1, low: 9.95, close: 10.05, volume: 500, amount: 5025 },
    ])
    expect(result.upserted).toBe(1)
  })

  it('getLastSyncedAt returns initial epoch', async () => {
    const t = await getLastSyncedAt('daily')
    expect(t).toBe('1970-01-01T00:00:00.000Z')
  })

  it('setLastSyncedAt updates the cursor', async () => {
    await setLastSyncedAt('daily', '2026-09-15T12:00:00Z')
    const t = await getLastSyncedAt('daily')
    expect(t).toBe('2026-09-15T12:00:00.000Z')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/data/ingest.test.ts
```

预期: FAIL — `Cannot find module './ingest'`。

- [ ] **Step 3: 实现 ingest.ts**

`src/lib/data/ingest.ts`:

```ts
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import type { DailyBar, MinuteBar } from './provider'

interface IngestResult {
  upserted: number
}

/**
 * 增量入库日线。upsert 语义: 同 (symbol_code, trade_date) 覆盖。
 * 使用 service_role client 绕过 RLS,仅服务端可用。
 */
export async function ingestDailyBars(bars: DailyBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient()
  const rows = bars.map((b) => ({
    symbol_code: b.symbolCode,
    trade_date: b.tradeDate,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    amount: b.amount,
  }))
  const { error } = await supabase
    .from('trade260915a_quant_daily_bars')
    .upsert(rows, { onConflict: 'symbol_code,trade_date' })
  if (error) throw new Error(`ingestDailyBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function ingestMinuteBars(bars: MinuteBar[]): Promise<IngestResult> {
  if (bars.length === 0) return { upserted: 0 }
  const supabase = getServiceRoleClient()
  const rows = bars.map((b) => ({
    symbol_code: b.symbolCode,
    trade_date: b.tradeDate,
    trade_time: b.tradeTime,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    amount: b.amount,
  }))
  const { error } = await supabase
    .from('trade260915a_quant_minute_bars')
    .upsert(rows, { onConflict: 'symbol_code,trade_time' })
  if (error) throw new Error(`ingestMinuteBars failed: ${error.message}`)
  return { upserted: bars.length }
}

export async function getLastSyncedAt(dataType: 'daily' | 'minute'): Promise<string> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_ingest_state')
    .select('last_synced_at')
    .eq('data_type', dataType)
    .single()
  if (error) throw new Error(`getLastSyncedAt failed: ${error.message}`)
  return data.last_synced_at
}

export async function setLastSyncedAt(dataType: 'daily' | 'minute', isoTime: string): Promise<void> {
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('trade260915a_quant_ingest_state')
    .update({ last_synced_at: isoTime })
    .eq('data_type', dataType)
  if (error) throw new Error(`setLastSyncedAt failed: ${error.message}`)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/data/ingest.test.ts
```

预期: PASS, 5 tests。**前提是本地 Supabase 在运行**。

- [ ] **Step 5: 提交**

```bash
git add src/lib/data/ingest.ts src/lib/data/ingest.test.ts
git commit -m "feat(data): ingest upsert for daily and minute bars"
```

---

## Task 7: data/query.ts (读 API)

**Files:**
- Create: `src/lib/data/query.ts`
- Create: `src/lib/data/query.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/data/query.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import { ingestDailyBars, ingestMinuteBars } from './ingest'
import { getDailyBars, getMinuteBars, listSymbols, getSymbol } from './query'

const skipIfNoDb = process.env.SUPABASE_URL ? describe : describe.skip

skipIfNoDb('query', () => {
  beforeEach(async () => {
    const supabase = getServiceRoleClient()
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_symbols').delete().neq('code', '__none__')
    await ingestDailyBars([
      { symbolCode: '600000', tradeDate: '2026-09-10', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000, amount: 10500 },
      { symbolCode: '600000', tradeDate: '2026-09-11', open: 10.5, high: 11.2, low: 10.3, close: 10.8, volume: 1200, amount: 12960 },
      { symbolCode: '600036', tradeDate: '2026-09-10', open: 30, high: 31, low: 29.5, close: 30.5, volume: 2000, amount: 60000 },
    ])
    await ingestMinuteBars([
      { symbolCode: '600000', tradeDate: '2026-09-10', tradeTime: '2026-09-10T01:31:00Z', open: 10, high: 10.1, low: 9.95, close: 10.05, volume: 500, amount: 5025 },
    ])
  })

  afterEach(async () => {
    const supabase = getServiceRoleClient()
    await supabase.from('trade260915a_quant_daily_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_minute_bars').delete().neq('symbol_code', '__none__')
    await supabase.from('trade260915a_quant_symbols').delete().neq('code', '__none__')
  })

  it('getDailyBars returns bars for range', async () => {
    const bars = await getDailyBars('600000', '2026-09-10', '2026-09-11')
    expect(bars.length).toBe(2)
    expect(bars[0].tradeDate).toBe('2026-09-10')
    expect(bars[0].close).toBe(10.5)
  })

  it('getDailyBars returns empty for symbol with no data', async () => {
    const bars = await getDailyBars('600999', '2026-09-10', '2026-09-11')
    expect(bars).toEqual([])
  })

  it('getMinuteBars returns minute bars', async () => {
    const bars = await getMinuteBars('600000', '2026-09-10', '2026-09-10')
    expect(bars.length).toBe(1)
    expect(bars[0].tradeTime).toBe('2026-09-10T01:31:00Z')
  })

  it('listSymbols returns empty when none in DB', async () => {
    const symbols = await listSymbols()
    expect(symbols).toEqual([])
  })

  it('getSymbol returns null when not in DB', async () => {
    const symbol = await getSymbol('999999')
    expect(symbol).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/data/query.test.ts
```

预期: FAIL — `Cannot find module './query'`。

- [ ] **Step 3: 实现 query.ts**

`src/lib/data/query.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { DailyBar, MinuteBar, Symbol } from './provider'

/**
 * 读 API。供回测引擎、策略求值、UI 页面使用。
 * 使用用户上下文 client (受 RLS 保护,只能读公开行情)。
 */

export async function listSymbols(): Promise<Symbol[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code, market, name, list_date, delist_date')
    .order('code')
  if (error) throw new Error(`listSymbols failed: ${error.message}`)
  return (data ?? []).map(rowToSymbol)
}

export async function getSymbol(code: string): Promise<Symbol | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code, market, name, list_date, delist_date')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`getSymbol failed: ${error.message}`)
  return data ? rowToSymbol(data) : null
}

export async function getDailyBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<DailyBar[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_daily_bars')
    .select('symbol_code, trade_date, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_date')
  if (error) throw new Error(`getDailyBars failed: ${error.message}`)
  return (data ?? []).map(rowToDailyBar)
}

export async function getMinuteBars(
  symbolCode: string,
  from: string,
  to: string,
): Promise<MinuteBar[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trade260915a_quant_minute_bars')
    .select('symbol_code, trade_date, trade_time, open, high, low, close, volume, amount')
    .eq('symbol_code', symbolCode)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_time')
  if (error) throw new Error(`getMinuteBars failed: ${error.message}`)
  return (data ?? []).map(rowToMinuteBar)
}

function rowToSymbol(row: any): Symbol {
  return {
    code: row.code,
    market: row.market,
    name: row.name,
    listDate: row.list_date,
    delistDate: row.delist_date,
  }
}

function rowToDailyBar(row: any): DailyBar {
  return {
    symbolCode: row.symbol_code,
    tradeDate: row.trade_date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}

function rowToMinuteBar(row: any): MinuteBar {
  return {
    symbolCode: row.symbol_code,
    tradeDate: row.trade_date,
    tradeTime: row.trade_time,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    amount: Number(row.amount),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/data/query.test.ts
```

预期: PASS, 5 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/data/query.ts src/lib/data/query.test.ts
git commit -m "feat(data): query API for symbols and bars"
```

---

## Task 8: data/index.ts (公共 API 与 provider 工厂)

**Files:**
- Create: `src/lib/data/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/data/index.ts`:

```ts
// 公共 API。重导出供上层调用。
export type { Symbol, DailyBar, MinuteBar, Market, MarketDataProvider } from './provider'
export { MockDataProvider } from './adapters/mock'
export * from './ingest'
export * from './query'

import type { MarketDataProvider } from './provider'
import { MockDataProvider } from './adapters/mock'

let cachedProvider: MarketDataProvider | null = null

/**
 * 工厂方法: 根据环境变量返回对应的 provider 实现。
 * 本期只支持 MockDataProvider,未来 TushareDataProvider 在此添加分支。
 */
export function getProvider(): MarketDataProvider {
  if (cachedProvider) return cachedProvider
  const name = process.env.MARKET_DATA_PROVIDER ?? 'mock'
  switch (name) {
    case 'mock':
      cachedProvider = new MockDataProvider()
      return cachedProvider
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${name}`)
  }
}
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS, 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/lib/data/index.ts
git commit -m "feat(data): public API and provider factory"
```

---

## Task 9: scheduler/trading-day.ts

**Files:**
- Create: `src/lib/scheduler/trading-day.ts`
- Create: `src/lib/scheduler/trading-day.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/scheduler/trading-day.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTradingDay, nextTradingDay, prevTradingDay, getTradingDays } from './trading-day'

describe('isTradingDay', () => {
  it('weekday is trading day', () => {
    expect(isTradingDay('2026-09-15')).toBe(true) // Tuesday
  })

  it('weekend is not trading day', () => {
    expect(isTradingDay('2026-09-12')).toBe(false) // Saturday
    expect(isTradingDay('2026-09-13')).toBe(false) // Sunday
  })

  it('holiday is not trading day', () => {
    expect(isTradingDay('2026-10-01')).toBe(false) // 国庆
    expect(isTradingDay('2026-02-09')).toBe(false) // 春节
  })
})

describe('nextTradingDay', () => {
  it('next trading day after a weekday', () => {
    expect(nextTradingDay('2026-09-15')).toBe('2026-09-16') // Tue -> Wed
  })

  it('next trading day after Friday', () => {
    expect(nextTradingDay('2026-09-18')).toBe('2026-09-21') // Fri -> next Mon
  })

  it('next trading day skipping holidays', () => {
    expect(nextTradingDay('2026-09-30')).toBe('2026-10-09') // 国庆前一天 -> 国庆后第一个交易日
  })
})

describe('prevTradingDay', () => {
  it('previous trading day', () => {
    expect(prevTradingDay('2026-09-16')).toBe('2026-09-15')
  })

  it('previous trading day before Monday', () => {
    expect(prevTradingDay('2026-09-21')).toBe('2026-09-18')
  })
})

describe('getTradingDays', () => {
  it('returns trading days in range', () => {
    const days = getTradingDays('2026-09-14', '2026-09-18')
    expect(days).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
  })

  it('excludes holidays', () => {
    const days = getTradingDays('2026-09-29', '2026-10-12')
    expect(days).toEqual([
      '2026-09-29', '2026-09-30',
      // 跳过 10/01-10/08 国庆
      '2026-10-09', '2026-10-12',
    ])
  })

  it('returns empty for range with no trading days', () => {
    const days = getTradingDays('2026-10-03', '2026-10-07') // 全在国庆假期内
    expect(days).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/scheduler/trading-day.test.ts
```

预期: FAIL — `Cannot find module './trading-day'`。

- [ ] **Step 3: 实现 trading-day.ts**

`src/lib/scheduler/trading-day.ts`:

```ts
// A 股交易日历。节假日表硬编码,每年 12 月从国务院办公厅通知更新。

const HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-07',
  '2025-05-01', '2025-05-02', '2025-05-05',
  '2025-05-31', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026
  '2026-01-01', '2026-01-02',
  '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
])

/** "YYYY-MM-DD" 是否为交易日 (周末与节假日均非交易日) */
export function isTradingDay(date: string): boolean {
  const d = new Date(date + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !HOLIDAYS.has(date)
}

/** 给定日期的下一个交易日 (含给定的 next) */
export function nextTradingDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  let s = d.toISOString().slice(0, 10)
  while (!isTradingDay(s)) {
    d.setUTCDate(d.getUTCDate() + 1)
    s = d.toISOString().slice(0, 10)
  }
  return s
}

/** 给定日期的上一个交易日 */
export function prevTradingDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  let s = d.toISOString().slice(0, 10)
  while (!isTradingDay(s)) {
    d.setUTCDate(d.getUTCDate() - 1)
    s = d.toISOString().slice(0, 10)
  }
  return s
}

/** 返回 [from, to] 闭区间内的所有交易日, 升序 */
export function getTradingDays(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  if (start > end) return result
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10)
    if (isTradingDay(s)) result.push(s)
  }
  return result
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/scheduler/trading-day.test.ts
```

预期: PASS, 11 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/scheduler/trading-day.ts src/lib/scheduler/trading-day.test.ts
git commit -m "feat(scheduler): trading day helpers with 2025-2026 holidays"
```

---

## Task 10: scheduler/time.ts

**Files:**
- Create: `src/lib/scheduler/time.ts`
- Create: `src/lib/scheduler/time.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/scheduler/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getSession, toBeijingTime, toUtcTime } from './time'

describe('getSession', () => {
  it('pre-market before 9:30 北京', () => {
    // 9:29 北京 = 1:29 UTC
    expect(getSession(new Date('2026-09-15T01:29:00Z'))).toBe('pre_market')
  })

  it('morning 9:30-11:30 北京', () => {
    expect(getSession(new Date('2026-09-15T01:30:00Z'))).toBe('morning')
    expect(getSession(new Date('2026-09-15T03:30:00Z'))).toBe('morning')
  })

  it('lunch 11:30-13:00 北京', () => {
    // 11:31 北京 = 3:31 UTC
    expect(getSession(new Date('2026-09-15T03:31:00Z'))).toBe('lunch')
    expect(getSession(new Date('2026-09-15T05:00:00Z'))).toBe('lunch')
  })

  it('afternoon 13:00-15:00 北京', () => {
    expect(getSession(new Date('2026-09-15T05:01:00Z'))).toBe('afternoon')
    expect(getSession(new Date('2026-09-15T07:00:00Z'))).toBe('afternoon')
  })

  it('post-market after 15:00 北京', () => {
    // 15:01 北京 = 7:01 UTC
    expect(getSession(new Date('2026-09-15T07:01:00Z'))).toBe('post_market')
  })
})

describe('toBeijingTime', () => {
  it('UTC 1:30 → 北京 9:30', () => {
    const utc = new Date('2026-09-15T01:30:00Z')
    const bjt = toBeijingTime(utc)
    expect(bjt.getUTCHours()).toBe(9)
    expect(bjt.getUTCMinutes()).toBe(30)
  })
})

describe('toUtcTime', () => {
  it('北京 9:30 → UTC 1:30', () => {
    const bjt = new Date('2026-09-15T09:30:00Z') // 用 UTC 字段表示北京时间
    const utc = toUtcTime(bjt)
    expect(utc.getUTCHours()).toBe(1)
    expect(utc.getUTCMinutes()).toBe(30)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/scheduler/time.test.ts
```

预期: FAIL — `Cannot find module './time'`。

- [ ] **Step 3: 实现 time.ts**

`src/lib/scheduler/time.ts`:

```ts
// A 股交易时段工具。
// 时区约定: Vercel Cron 与数据库使用 UTC; 业务时间(开盘/收盘等)按北京时间 UTC+8。
// 北京时间不变实行夏令时,UTC↔北京 永远相差 8 小时。

export type Session = 'pre_market' | 'morning' | 'lunch' | 'afternoon' | 'post_market'

const SESSION_BOUNDS_UTC_MIN = {
  morningOpen: 1 * 60 + 30,   // 9:30 北京 = 1:30 UTC
  morningClose: 3 * 60 + 30,  // 11:30 北京 = 3:30 UTC
  afternoonOpen: 5 * 60 + 1,  // 13:01 北京 = 5:01 UTC (cron 在 5:00 触发后)
  afternoonClose: 7 * 60,     // 15:00 北京 = 7:00 UTC
}

/**
 * 返回给定 UTC 时刻所处的 A 股时段。
 * 注意: 周末与节假日也由 getSession 返回具体时段;是否交易日由 trading-day 模块判断。
 */
export function getSession(date: Date): Session {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  if (minutes < SESSION_BOUNDS_UTC_MIN.morningOpen) return 'pre_market'
  if (minutes < SESSION_BOUNDS_UTC_MIN.morningClose) return 'morning'
  if (minutes < SESSION_BOUNDS_UTC_MIN.afternoonOpen) return 'lunch'
  if (minutes < SESSION_BOUNDS_UTC_MIN.afternoonClose) return 'afternoon'
  return 'post_market'
}

/** UTC Date → 北京时间 Date (内部仍用 UTC 字段,含义为北京时间) */
export function toBeijingTime(utc: Date): Date {
  return new Date(utc.getTime() + 8 * 60 * 60 * 1000)
}

/** 北京时间 Date (用 UTC 字段表示) → UTC Date */
export function toUtcTime(beijing: Date): Date {
  return new Date(beijing.getTime() - 8 * 60 * 60 * 1000)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/scheduler/time.test.ts
```

预期: PASS, 7 tests。

- [ ] **Step 5: 提交**

```bash
git add src/lib/scheduler/time.ts src/lib/scheduler/time.test.ts
git commit -m "feat(scheduler): A 股 session helpers with UTC↔北京 conversion"
```

---

## Task 11: scheduler/index.ts

**Files:**
- Create: `src/lib/scheduler/index.ts`

- [ ] **Step 1: 实现 index**

`src/lib/scheduler/index.ts`:

```ts
// 公共 API
export * from './trading-day'
export * from './time'
```

- [ ] **Step 2: 编译检查**

```bash
pnpm typecheck
```

预期: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/scheduler/index.ts
git commit -m "feat(scheduler): public API barrel"
```

---

## Task 12: cron/ingest-daily route

**Files:**
- Create: `src/app/api/cron/ingest-daily/route.ts`

- [ ] **Step 1: 实现 route handler**

`src/app/api/cron/ingest-daily/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/data'
import { ingestDailyBars, getLastSyncedAt, setLastSyncedAt } from '@/lib/data/ingest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * 日终入库。从 Mock (或未来 Tushare) 拉取从 last_synced_at 至今的日线,
 * upsert 到 trade260915a_quant_daily_bars, 更新 last_synced_at。
 *
 * 安全: 仅 Vercel Cron (带 CRON_SECRET bearer token) 可调用。
 * 频率: 每日 16:20 北京 (UTC 8:20)。
 */

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = getProvider()
  const supabase = getServiceRoleClient()

  const { data: symbols, error: symErr } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code')
  if (symErr) {
    return NextResponse.json({ error: `symbol query failed: ${symErr.message}` }, { status: 500 })
  }

  const lastSync = await getLastSyncedAt('daily')
  const today = new Date().toISOString().slice(0, 10)

  let totalUpserted = 0
  for (const { code } of symbols ?? []) {
    const bars = await provider.getDailyBarsSince(code, lastSync.slice(0, 10))
    if (bars.length === 0) continue
    const result = await ingestDailyBars(bars)
    totalUpserted += result.upserted
  }

  await setLastSyncedAt('daily', new Date().toISOString())

  return NextResponse.json({
    ok: true,
    symbols: symbols?.length ?? 0,
    upserted: totalUpserted,
    lastSync,
    today,
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
git add src/app/api/cron/ingest-daily/route.ts
git commit -m "feat(cron): ingest-daily endpoint with auth check"
```

---

## Task 13: cron/ingest-minute route

**Files:**
- Create: `src/app/api/cron/ingest-minute/route.ts`

- [ ] **Step 1: 实现 route handler**

`src/app/api/cron/ingest-minute/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/data'
import { ingestMinuteBars, getLastSyncedAt, setLastSyncedAt } from '@/lib/data/ingest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * 分钟线入库。从 Mock 拉取最新分钟线,upsert 到 trade260915a_quant_minute_bars。
 *
 * 频率: 交易日 9:35-11:30 / 13:05-15:00 每 5 分钟 (配置见 vercel.json)。
 */

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = getProvider()
  const supabase = getServiceRoleClient()

  const { data: symbols } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code')

  const lastSync = await getLastSyncedAt('minute')

  let totalUpserted = 0
  for (const { code } of symbols ?? []) {
    const bars = await provider.getMinuteBarsSince(code, lastSync)
    if (bars.length === 0) continue
    const result = await ingestMinuteBars(bars)
    totalUpserted += result.upserted
  }

  await setLastSyncedAt('minute', new Date().toISOString())

  return NextResponse.json({
    ok: true,
    symbols: symbols?.length ?? 0,
    upserted: totalUpserted,
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
git add src/app/api/cron/ingest-minute/route.ts
git commit -m "feat(cron): ingest-minute endpoint with auth check"
```

---

## Task 14: 一次性种子脚本 (导入所有主板股票元数据)

**Files:**
- Create: `scripts/seed-symbols.ts`

- [ ] **Step 1: 实现脚本**

`scripts/seed-symbols.ts`:

```ts
/**
 * 把 Mock provider 的所有 symbol 一次性导入到 trade260915a_quant_symbols。
 * 仅本地开发用。生产环境用真实数据源的初始化脚本替代。
 *
 * 运行: pnpm seed:symbols
 */
import { getProvider } from '../src/lib/data'
import { getServiceRoleClient } from '../src/lib/supabase/service-role'

async function main() {
  const provider = getProvider()
  const supabase = getServiceRoleClient()

  console.log('Fetching symbols from MockDataProvider...')
  const symbols = await provider.listSymbols()
  console.log(`Got ${symbols.length} symbols`)

  const rows = symbols.map((s) => ({
    code: s.code,
    market: s.market,
    name: s.name,
    list_date: s.listDate,
    delist_date: s.delistDate,
    is_mainboard: true,
  }))

  console.log('Upserting to Supabase...')
  const { error } = await supabase
    .from('trade260915a_quant_symbols')
    .upsert(rows, { onConflict: 'code' })
  if (error) throw new Error(error.message)

  console.log(`Done. ${rows.length} symbols in DB.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: 添加 tsx 依赖与脚本**

修改 `package.json`:

```json
{
  "scripts": {
    "seed:symbols": "tsx scripts/seed-symbols.ts"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

```bash
pnpm add -D tsx
```

- [ ] **Step 3: 运行种子脚本**

```bash
pnpm seed:symbols
```

预期: 输出 `Done. 5997 symbols in DB.` (或类似数字)。

- [ ] **Step 4: 验证 DB**

```bash
pnpm dlx supabase db psql --local -c "SELECT count(*) FROM trade260915a_quant_symbols"
```

预期: 返回 ≥ 5000。

- [ ] **Step 5: 提交**

```bash
git add scripts/seed-symbols.ts package.json pnpm-lock.yaml
git commit -m "feat(scripts): seed symbols from Mock provider"
```

---

## Task 15: 手动触发 cron — ingest-daily

**Files:** 无新增。

- [ ] **Step 1: 启动 dev server (新终端)**

```bash
pnpm dev
```

- [ ] **Step 2: 用 curl 触发 cron 端点**

```bash
curl -X POST http://localhost:3000/api/cron/ingest-daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

(如果 `.env.local` 没设 `CRON_SECRET`,临时加一行 `CRON_SECRET=test-secret` 后重启 dev server。)

预期: 返回 JSON

```json
{
  "ok": true,
  "symbols": 5997,
  "upserted": 11994,
  "lastSync": "1970-01-01T00:00:00.000Z",
  "today": "2026-09-15"
}
```

(数字可能因交易日历与 lastSync 不同而异;只要 `upserted > 0` 即成功。)

- [ ] **Step 3: 验证 DB 有数据**

```bash
pnpm dlx supabase db psql --local -c "SELECT count(*) FROM trade260915a_quant_daily_bars"
```

预期: 返回数字 > 0。

- [ ] **Step 4: 验证 ingest_state 已更新**

```bash
pnpm dlx supabase db psql --local -c "SELECT * FROM trade260915a_quant_ingest_state"
```

预期: daily 与 minute 行的 `last_synced_at` 是刚才 cron 触发的时间。

- [ ] **Step 5: 重新触发,验证幂等**

```bash
curl -X POST http://localhost:3000/api/cron/ingest-daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

预期: 第二次 `upserted` 数字应该**接近 0**(因为 last_synced_at 已更新,没有新数据)。

---

## Task 16: lightweight-charts 依赖 + KlineChart 组件

**Files:**
- Create: `src/components/market/kline-chart.tsx`
- Modify: `package.json`

- [ ] **Step 1: 添加依赖**

```bash
pnpm add lightweight-charts
```

预期: package.json 出现 `"lightweight-charts": "^5.x.x"`,`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 实现 KlineChart 组件**

`src/components/market/kline-chart.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import type { DailyBar } from '@/lib/data'

interface KlineChartProps {
  bars: DailyBar[]
  symbolName: string
}

export function KlineChart({ bars, symbolName }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: 'white' },
        textColor: '#1f2937',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    const data: CandlestickData[] = bars.map((b) => ({
      time: b.tradeDate as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    series.setData(data)

    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [bars])

  return (
    <div>
      <div className="text-sm text-gray-600 mb-2">{symbolName} K 线</div>
      <div ref={containerRef} className="w-full" />
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
git add src/components/market/kline-chart.tsx package.json pnpm-lock.yaml
git commit -m "feat(market): KlineChart client component with lightweight-charts"
```

---

## Task 17: (dashboard) 布局与导航

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/nav.tsx`

- [ ] **Step 1: 创建 nav 客户端组件**

`src/app/(dashboard)/nav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/strategy', label: '策略' },
  { href: '/backtest', label: '回测' },
  { href: '/portfolio', label: '持仓' },
  { href: '/market', label: '行情' },
]

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname()
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold text-gray-900">
          Trade · Quant
        </Link>
        <ul className="flex items-center gap-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'text-sm hover:text-indigo-600',
                  pathname?.startsWith(link.href)
                    ? 'text-indigo-600 font-medium'
                    : 'text-gray-700',
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <span className="text-sm text-gray-600">{email}</span>
    </nav>
  )
}
```

- [ ] **Step 2: 创建 layout (Server Component)**

`src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from './nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      <DashboardNav email={user.email ?? ''} />
      <main className="px-6 py-8">{children}</main>
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
git add "src/app/(dashboard)/layout.tsx" "src/app/(dashboard)/nav.tsx"
git commit -m "feat(dashboard): layout with auth and navigation"
```

---

## Task 18: /market 主板股票列表页

**Files:**
- Create: `src/app/(dashboard)/market/page.tsx`

- [ ] **Step 1: 实现列表页**

`src/app/(dashboard)/market/page.tsx`:

```tsx
import Link from 'next/link'
import { listSymbols } from '@/lib/data/query'

export default async function MarketPage() {
  const symbols = await listSymbols()
  const top = symbols.slice(0, 100) // MVP: 仅显示前 100,后续加分页

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">主板行情</h1>
        <span className="text-sm text-gray-600">
          共 {symbols.length} 只 (显示前 {top.length})
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">代码</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名称</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">市场</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {top.map((s) => (
              <tr key={s.code} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <Link href={`/market/${s.code}`} className="text-indigo-600 hover:underline">
                    {s.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{s.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.market}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 启动 dev server,访问页面**

```bash
# 已有 dev server 在运行
# 浏览器访问 http://localhost:3000/market
```

预期: 登录后看到主板股票列表,前 100 只代码与名称,点击代码跳转到详情页。

- [ ] **Step 3: 提交**

```bash
git add "src/app/(dashboard)/market/page.tsx"
git commit -m "feat(market): symbol list page"
```

---

## Task 19: /market/[symbol] K 线详情页

**Files:**
- Create: `src/app/(dashboard)/market/[symbol]/page.tsx`

- [ ] **Step 1: 实现详情页**

`src/app/(dashboard)/market/[symbol]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getDailyBars, getSymbol } from '@/lib/data/query'
import { KlineChart } from '@/components/market/kline-chart'

interface PageProps {
  params: Promise<{ symbol: string }>
}

export default async function SymbolDetailPage({ params }: PageProps) {
  const { symbol: symbolCode } = await params

  const symbol = await getSymbol(symbolCode)
  if (!symbol) notFound()

  // 最近 60 个交易日
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const bars = await getDailyBars(symbolCode, from, to)

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {symbol.name} ({symbol.code})
        </h1>
        <p className="text-sm text-gray-600">{symbol.market} 主板</p>
      </div>

      <Alert variant="destructive" className="mb-4">
        <AlertDescription>
          展示数据为模拟数据,非真实行情。生产环境请配置真实数据源。
        </AlertDescription>
      </Alert>

      {bars.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-600">
          暂无数据,请先运行 ingest-daily cron 导入历史数据。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <KlineChart bars={bars} symbolName={`${symbol.name} (${symbol.code})`} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 确认 Alert 组件存在或添加**

如果 `src/components/ui/alert.tsx` 已有,直接用。如果不存在:

```bash
pnpm dlx shadcn@latest add alert
```

- [ ] **Step 3: 浏览器访问详情页**

```bash
# 浏览器访问 http://localhost:3000/market/600000
```

预期: 看到股票名 + Mock 数据提示 Alert + K 线图 (60 根左右日线)。

- [ ] **Step 4: 提交**

```bash
git add "src/app/(dashboard)/market/[symbol]/page.tsx"
git commit -m "feat(market): symbol detail page with K-line chart"
```

---

## Task 20: vercel.json cron 配置

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: 写 vercel.json**

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-minute",
      "schedule": "5,10,15,20,25,30,35,40,45,50,55 1-3 * * 1-5"
    },
    {
      "path": "/api/cron/ingest-minute",
      "schedule": "5,10,15,20,25,30,35,40,45,50,55 5-7 * * 1-5"
    },
    {
      "path": "/api/cron/ingest-daily",
      "schedule": "20 8 * * 1-5"
    }
  ]
}
```

> 时间说明 (Vercel Cron UTC):
> - `ingest-minute` 5 分钟一次,在 1:00-3:55 UTC (北京 9:00-11:55) 与 5:00-7:55 UTC (北京 13:00-15:55),仅工作日
> - `ingest-daily` 8:20 UTC (北京 16:20) 工作日

- [ ] **Step 2: 提交**

```bash
git add vercel.json
git commit -m "feat(cron): vercel.json schedule"
```

---

## Task 21: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在 README 添加新章节**

在 `## 文档` 之前插入:

```markdown
## Quant 模块 (Phase 0+)

A 股主板量化交易 MVP。当前阶段: 数据层 + Mock 行情。

### 新增环境变量

| 变量 | 说明 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色 key,用于 cron 端点绕过 RLS。**仅服务端可用,严禁暴露** |
| `CRON_SECRET` | Cron 端点鉴权 secret。Vercel 自动注入到 `Authorization: Bearer` 头,本地用 curl 调试时手动加 |
| `MARKET_DATA_PROVIDER` | 数据源 provider,默认 `mock`。未来支持 `tushare` |

### 数据导入

首次部署后,需运行 seed 脚本导入主板股票元数据:

```bash
pnpm seed:symbols
```

随后 Vercel Cron 会每日自动入库日线与分钟线 (Mock 数据)。

### 手动触发 cron (本地调试)

```bash
curl -X POST http://localhost:3000/api/cron/ingest-daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Mock 数据说明

行情数据为模拟数据 (GBM 模型),非真实 A 股数据。生产环境务必切换到 Tushare 等真实数据源。
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: quant module Phase 0 setup instructions"
```

---

## Task 22: 端到端验证

**Files:** 无新增。

- [ ] **Step 1: 运行所有测试**

```bash
pnpm test
```

预期: 所有测试通过 (provider / mock / ingest / query / scheduler / trading-day / time)。

- [ ] **Step 2: 运行覆盖率**

```bash
pnpm test:cov
```

预期:
- 整体 ≥ 80%
- `lib/data/*` ≥ 90%
- `lib/scheduler/*` ≥ 90%

- [ ] **Step 3: 类型检查 + lint**

```bash
pnpm typecheck && pnpm lint
```

预期: 全 PASS。

- [ ] **Step 4: 完整 e2e 流程**

```bash
# 1. 重置 DB
pnpm dlx supabase db reset

# 2. 启动 dev server (新终端)
pnpm dev

# 3. (新终端) seed symbols
pnpm seed:symbols

# 4. 触发 daily ingest
curl -X POST http://localhost:3000/api/cron/ingest-daily \
  -H "Authorization: Bearer $CRON_SECRET"

# 5. 浏览器
# a. http://localhost:3000/auth/sign-in 注册 + 登录
# b. http://localhost:3000/market → 看到列表
# c. 点击 600000 → /market/600000 → 看到 K 线
```

预期: 全部步骤成功,无 console error。

- [ ] **Step 5: 提交 (如有需要)**

```bash
git status  # 检查是否有遗漏
git add -A   # 如果有
git commit -m "chore: Phase 0 end-to-end verification"
```

---

## 质量门 (DoD)

- [ ] `pnpm test` 全部通过
- [ ] `pnpm test:cov` 整体 ≥ 80%,核心模块 ≥ 90%
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint` PASS
- [ ] `pnpm seed:symbols` 成功导入 ≥ 5000 主板股票
- [ ] cron `ingest-daily` 触发后 `trade260915a_quant_daily_bars` 有数据
- [ ] `/market` 列表页正常渲染
- [ ] `/market/600000` K 线图正常显示 60+ 根日线
- [ ] 全部代码已提交并 push
- [ ] README 已更新

---

## 变更日志

- 2026-09-15: Phase 0 实施计划 v2,调整 task 顺序把 service-role 客户端提前到 ingest 之前 (修复 RLS 写入 bug),22 个任务覆盖 schema + 数据层 + Mock provider + 调度 + UI 基础。
