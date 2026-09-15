# A 股量化交易 — 设计规范

**日期**: 2026-09-15
**状态**: 已设计,待用户复核
**前置依赖**: `2026-06-20-block1-auth-design.md` (登录)、`2026-06-20-block1-admin-role-design.md` (admin 角色)
**范围**: 在现有 Next.js + Supabase 全栈应用上搭建 A 股主板量化交易 MVP,覆盖行情数据 / 因子策略 / 回测 / 模拟交易 / 风控 / 调度 / UI 全部子系统

---

## 1. 目标

为多租户 SaaS 用户提供 A 股主板量化交易能力,核心闭环:

- 用户用**预设因子清单**搭建策略,选择 6 个内置因子之一、设阈值、用 AND/OR 组合入场/出场条件
- 用户对策略运行**历史回测**,看收益曲线、最大回撤、夏普等指标
- 用户**启动策略**,系统按 cron 节奏在交易日收盘自动调仓,模拟撮合 + T+1 结算
- 用户查看当前**模拟持仓、成交记录、权益曲线**
- **风控规则**在每条订单生成时校验:仓位上限、最大回撤止损触发后停止策略
- 数据源走**适配器模式**,本期用 Mock,真实数据源 (Tushare 等) 留接口后续接入
- 实盘券商接口留接口 (PaperBroker 实现完整,实盘 BrokerAdapter 留空,本期不实现)

成功标准:
- 注册用户能创建一个含入场 + 出场条件的策略
- 能对 1 年历史数据跑回测,看到总收益 / 最大回撤 / 夏普 / 胜率等指标与权益曲线
- 启动策略后,在 mock 交易日 15:10 触发收盘调仓,生成订单
- 订单在次日开盘成交,持仓 / 资金 / T+1 解禁全部正确
- 设置 maxDrawdownPct=5% 的策略,跑出负收益后 portfolio.status 自动 → 'stopped'
- 所有登录用户**只能看到自己的策略 / 回测 / 持仓**,无跨用户泄露

## 2. 范围之外 (YAGNI)

本轮**不**做:

- 实盘券商对接 (CTP / XTP / 恒生UFT / 掘金) — `BrokerAdapter` 接口预留,实盘实现留后续 phase
- 真实数据源接入 (Tushare / AkShare / 通联) — `MarketDataProvider` 接口预留,Mock 是默认实现
- 创业板 / 科创板 / 北交所 / ETF / 可转债 — 仅主板 (`6xxxxx` + `00xxxxx`),涨跌停统一 ±10%
- ST 股 / 新股首日特例 — 一律按 ±10% 处理
- 高频 / Tick 级交易 — 仅日线 + 分钟线,无逐笔回放
- 策略 DSL / Python 沙箱 / 可视化拖拽 — 仅 6 个预设因子,无自定义脚本
- 因子自定义公式 — 因子参数 (如 lookback) 可调,因子逻辑不可改
- 分钟级实时调仓 — MVP 收盘调仓,盘中不调
- 多账户 / 跨策略组合级别风控 — 仅单策略仓位级
- 因子 IC / Alpha / Beta / 因子暴露等高级回测指标 — 仅总收益 / 年化 / 最大回撤 / 夏普 / 胜率
- 策略分享 / 公开策略广场 / 跟单
- 实时 WebSocket 推送 — 行情走 cron 拉取,前端刷新看
- 国际化新增语言 — 仅在现有 en / zh 上加 `quant.*` 命名空间
- 手机端适配 — 桌面 Web 优先
- 增强的 RLS (service_role 之外的角色) — service_role 写,authenticated 读自己
- 因子历史回放 / 因子贡献归因 / 收益归因
- 回测任务队列异步化 (本期同步跑;超 5s 留接缝后续 phase)
- 时段内多次再平衡 — 一日一次
- 模拟交易的手动下单 UI — 本期所有订单由 cron 调仓自动生成,用户不主动下单

## 3. 技术选型

| 类别 | 选型 |
|---|---|
| 框架 | 沿用 Next.js 16 + App Router + React 19 + TypeScript |
| 数据库 | Supabase Postgres + 分区表 (按 trade_date 月份分区) |
| 鉴权 / 隔离 | 沿用 Supabase Auth + RLS (本表全部带 `user_id`) |
| 行情数据 | `MarketDataProvider` 接口 + MockDataProvider (默认,确定性伪随机) |
| 券商 | `BrokerAdapter` 接口 + PaperBroker (本期实现) |
| 调度 | Vercel Cron (5 个端点) |
| 图表 | `lightweight-charts` (TradingView 开源) — K 线 + 权益曲线 |
| 表单 | 沿用 react-hook-form + zod |
| 国际化 | 沿用现有 `lib/i18n.ts` + locales (en/zh),新增 `quant.*` 命名空间 |
| UI 组件 | 沿用 shadcn/ui (Button / Card / Tabs / Alert / Input / Label / Table 新加) |
| 测试 | 沿用 Vitest + Testing Library + Playwright |
| 部署 | 沿用 Vercel |
| 包管理 | 沿用 pnpm |
| 精度 | 金融字段 NUMERIC(12,4) 价格 / NUMERIC(14,2) 金额 / INTEGER 股数 / BIGINT 成交量 |

**新增依赖**: 仅 `lightweight-charts` (~50KB gzip)。

## 4. 目录结构 (新增文件)

```
src/
├── app/
│   ├── (dashboard)/                            # 新建 route group,要求登录
│   │   ├── layout.tsx                          # 鉴权 + 顶部导航
│   │   ├── strategy/
│   │   │   ├── page.tsx                        # 列表 (Server Component)
│   │   │   ├── new/page.tsx                    # 新建 (Client form)
│   │   │   └── [id]/page.tsx                   # 详情 / 编辑 / 启停
│   │   ├── backtest/
│   │   │   ├── page.tsx                        # 历史回测列表
│   │   │   └── [id]/page.tsx                   # 报告页 (曲线 + 指标 + 交易明细)
│   │   ├── portfolio/
│   │   │   ├── page.tsx                        # 当前持仓 + 权益曲线
│   │   │   └── trades/page.tsx                 # 成交明细
│   │   └── market/
│   │       ├── page.tsx                        # 主板股票列表
│   │       └── [symbol]/page.tsx               # 单只股票 K 线 + 因子面板
│   └── api/
│       └── cron/
│           ├── ingest-minute/route.ts          # 分钟线增量入库
│           ├── settle-pending/route.ts         # 盘中撮合 pending 订单
│           ├── run-strategies/route.ts         # 收盘调仓
│           ├── t1-settle/route.ts              # T+1 解禁
│           └── ingest-daily/route.ts           # 日终入库
│
├── components/
│   ├── strategy/
│   │   ├── strategy-form.tsx                   # 因子动态表单
│   │   ├── condition-row.tsx                   # 单条条件行
│   │   └── factor-selector.tsx                 # 因子下拉 + 动态参数
│   ├── backtest/
│   │   ├── equity-curve-chart.tsx              # 权益曲线 (lightweight-charts)
│   │   ├── kline-chart.tsx                     # K 线图
│   │   └── metrics-table.tsx                   # 指标卡片
│   ├── portfolio/
│   │   ├── positions-table.tsx                 # 持仓表
│   │   └── trades-table.tsx                    # 成交明细表
│   ├── market/
│   │   └── factor-panel.tsx                    # 因子当前值面板
│   └── (auth/ 已有, ui/ 已有)
│
└── lib/
    ├── data/
    │   ├── index.ts                            # 公共 API: getProvider() 工厂
    │   ├── provider.ts                         # MarketDataProvider 接口
    │   ├── adapters/
    │   │   ├── mock.ts                         # MockDataProvider (默认)
    │   │   └── README.md                       # 真实数据源接入指南 (本期不实现)
    │   ├── ingest.ts                           # 增量入库
    │   └── query.ts                            # 查询 API
    ├── factors/
    │   ├── index.ts                            # 公共 API
    │   ├── registry.ts                         # FACTORS 注册表
    │   ├── momentum.ts                         # RETURN_5D / RETURN_20D / RETURN_60D
    │   ├── moving-average.ts                   # MA_CROSS
    │   ├── volume.ts                           # VOLUME_RATIO
    │   └── value.ts                            # PE_TTM
    ├── strategy/
    │   ├── index.ts                            # 公共 API
    │   ├── types.ts                            # StrategySpec + zod schema
    │   ├── compose.ts                          # 校验 + 默认值填充
    │   ├── evaluate.ts                         # 求值 (回测/实盘共用)
    │   └── actions.ts                          # Server Actions (CRUD)
    ├── backtest/
    │   ├── index.ts                            # 公共 API
    │   ├── engine.ts                           # 主回测循环
    │   ├── fills.ts                            # 撮合 + 费率 + 涨跌停
    │   ├── metrics.ts                          # 收益 / 回撤 / 夏普
    │   ├── report.ts                           # 输出 BacktestOutput
    │   └── actions.ts                          # Server Actions
    ├── trading/
    │   ├── index.ts                            # 公共 API
    │   ├── broker.ts                           # BrokerAdapter 接口
    │   ├── orders.ts                           # 订单操作 + 状态机
    │   ├── settle.ts                           # T+1 解禁逻辑
    │   ├── adapters/
    │   │   ├── paper.ts                        # PaperBroker (本期)
    │   │   └── README.md                       # 实盘 Broker 接入指南 (本期不实现)
    │   └── actions.ts                          # Server Actions (submit/cancel)
    ├── risk/
    │   ├── index.ts                            # 公共 API
    │   ├── rules.ts                            # RiskRule 接口 + 6 条规则实现
    │   ├── engine.ts                           # 规则引擎 (顺序求值)
    │   ├── peak.ts                             # 回撤峰值查询
    │   └── messages.ts                         # i18n 错误信息
    ├── scheduler/
    │   ├── index.ts                            # 公共 API
    │   ├── trading-day.ts                      # 交易日判断 + 节假日表
    │   └── time.ts                             # A 股交易时段工具
    └── (auth/ 已有, supabase/ 已有, schemas/ 已有, services/ 已有)

supabase/
├── migrations/
│   ├── 001_init.sql                            # 已有
│   ├── 002_quant_schema.sql                    # 新建: quant 表 + RLS
│   ├── 003_trading_schema.sql                  # 新建: portfolios / orders / fills
│   ├── 004_seed_factors.sql                    # 新建: 因子定义种子 (本期未用,留接缝)
│   └── ...
└── (其他已有)

vercel.json                                     # 新增 cron 配置

docs/superpowers/
├── specs/
│   └── 2026-09-15-quant-trading-design.md      # 本文件
└── plans/
    └── (后续 5 个 plan 文档,每个 phase 一个)
```

**文件大小控制** (沿用项目约定):

| 文件 | 行数上限 |
|---|---|
| `lib/data/adapters/mock.ts` | < 400 |
| `lib/factors/*.ts` (每因子文件) | < 150 |
| `lib/backtest/engine.ts` | < 500 |
| `lib/backtest/metrics.ts` | < 200 |
| `lib/risk/rules.ts` | < 400 |
| `components/strategy/strategy-form.tsx` | < 400 |
| `app/api/cron/*/route.ts` | < 80 (只编排) |
| `app/(dashboard)/*/page.tsx` | < 150 (Server Component 只串联) |

## 5. 视觉设计

沿用现有项目视觉系统 (白卡 + 渐变背景 + Indigo 强调色)。新增页面不引入新色板、不引入新字体。

### 5.1 (dashboard) 顶部导航

```
┌────────────────────────────────────────────────────────────┐
│  Trade · Quant     [策略] [回测] [持仓] [行情]   [email] │
└────────────────────────────────────────────────────────────┘
```

- 容器: `bg-white border-b border-gray-200 px-6 py-3`
- 链接: `text-sm text-gray-700 hover:text-indigo-600`,激活态 `text-indigo-600 font-medium`

### 5.2 策略列表页 `/strategy`

- 顶部条: 左侧 `h1 text-2xl font-semibold` "我的策略 / My Strategies"
- 右侧: `<Button>新建策略 / New Strategy</Button>`,跳 `/strategy/new`
- 列表卡片网格 (响应式, 1/2/3 列):
  - `<Card>` 包含: 策略名、状态徽章 (active=绿 / paused=黄 / draft=灰 / archived=灰)、创建时间、入场条件摘要
  - 卡片底部: `[回测] [编辑] [启停]` 三个按钮
- 空状态: 居中插画 + "还没有策略,创建第一个 / No strategies yet"

### 5.3 策略表单 `/strategy/new` 与 `/strategy/[id]`

四段折叠卡片 (默认展开前两段):

1. **基础信息**: 策略名称 (`<Input>`)
2. **入场条件**: 组合选择器 (`AND` / `OR` radio) + 条件列表
   - 单条条件: 因子下拉 + 动态参数表单 (随因子变化) + 比较符 (`>` `<` `>=` `<=` `cross_up` `cross_down`) + 阈值输入
   - `+ 添加条件` 按钮
3. **出场条件**: 同入场结构
4. **持仓与风控**: 最多持仓数 (`<Input type="number">`) + 单仓位占比 (`%`) + 最大回撤止损 (`%`)

底部固定操作条: `[取消]` `[保存草稿]` `[保存并启用]` 三按钮。

### 5.4 回测报告页 `/backtest/[id]`

```
┌────────────────────────────────────────────────────────────┐
│  策略名 · 回测报告                              [重新运行] │
├────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 总收益  │ │ 年化    │ │ 最大回撤│ │ 夏普    │          │
│  │ +12.3%  │ │ +8.7%   │ │ -8.2%   │ │ 1.24    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├────────────────────────────────────────────────────────────┤
│  权益曲线 (lightweight-charts area chart)                 │
├────────────────────────────────────────────────────────────┤
│  胜率 45%  │  总交易 28 笔  │  平均持仓 5.2 天           │
├────────────────────────────────────────────────────────────┤
│  交易明细表 (Table)                                        │
│  日期 | 股票 | 方向 | 价格 | 股数 | 金额 | 费用           │
└────────────────────────────────────────────────────────────┘
```

- 指标卡片: 沿用 `<Card>`,大字号数字 (text-3xl) + 小字标签
- 曲线: x 轴日期, y 轴权益 (元),颜色用 indigo-500
- 交易明细表: `<Table>` (新加 shadcn 组件),最大高度 600px,内容可滚

### 5.5 持仓页 `/portfolio`

- 顶部摘要卡: 总资产 (大字) + 现金 + 持仓市值 + 浮动盈亏 + 当日盈亏
- 中部权益曲线 (近 30 天)
- 底部持仓表: 股票代码 / 名称 / 持仓股数 / 可卖股数 / 成本价 / 现价 / 浮动盈亏 / 盈亏比

### 5.6 股票详情页 `/market/[symbol]`

- 上半: K 线 (Candlestick, 日线默认,可切 5/15/30/60 分钟)
- 下半: 6 个因子当前值面板 (绿/红圆点 + 数值 + 阈值)

### 5.7 加载与错误状态

- 加载: shadcn `<Skeleton>` (已有或新加)
- 错误: `<Alert variant="destructive">` + 错误信息双语
- 空: 居中插画 (沿用 dashboard 空状态) + 引导文案

## 6. 数据流

### 6.1 子系统依赖图

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  data/   │───▶│ factors/ │───▶│ strategy/│───▶│ backtest/│───▶│ trading/ │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                                              │              │
     │              ┌──────────┐                   │              │
     └─────────────▶│  risk/   │◀──────────────────┘◀─────────────┘
                    └──────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  scheduler/  │
                  └──────────────┘
```

数据层无依赖;因子层只依赖数据层;策略层只依赖因子层;回测层依赖数据 + 因子 + 策略;交易层依赖数据 + 因子 + 策略 + 风控;调度层编排前五个。

### 6.2 行情数据流

```
MockDataProvider (内存生成)
    │
    ▼  cron: /api/cron/ingest-daily
upsert → trade260915a_quant_daily_bars
    │
    ▼
query.getDailyBars(symbolCode, from, to)
    │
    ▼
  回测引擎 / 策略求值 / 因子计算
```

未来 TushareAdapter 接入:

```
TushareDataProvider
    │
    ▼  cron: 同 ingest 端点, 通过环境变量切换
upsert → trade260915a_quant_daily_bars
```

### 6.3 策略表达

```
用户在 <StrategyForm> 选因子 / 设参数 / 设阈值 / 组合
    │
    ▼  onSubmit → Server Action createStrategy
zod 校验 + 默认值填充
    │
    ▼
INSERT INTO trade260915a_strategies (spec JSONB, user_id, ...)
    │
    ▼
返回 strategyId → 重定向 /strategy/[id]
```

### 6.4 回测流

```
用户在 /strategy/[id] 点 "Run Backtest"
    │
    ▼  Server Action createBacktestRun
INSERT trade260915a_backtest_runs (status='running')
    │
    ▼  同步 await runBacktest(input)
runBacktest 内部:
  1. query.getDailyBars(symbols, start, end)
  2. for tradeDate in range:
       evaluateStrategy(spec.entry, date, bars)
       generate plan
       applyRiskLimits(plan, portfolio)    ← 回测不调 riskEngine, 直接算指标
       fills = matchFills(plan, nextBar)
       record trades + equity
  3. computeMetrics(equityCurve, trades)
    │
    ▼
UPDATE trade260915a_backtest_runs SET status='completed', result=BacktestOutput
    │
    ▼
重定向 /backtest/[runId] → 渲染报告
```

回测是**纯函数**,不依赖任何状态,可在测试中独立调用。

### 6.5 模拟交易流

```
策略被设置为 status='active' (用户在 UI 操作)
    │
    ▼  Server Action setStrategyStatus
INSERT trade260915a_portfolios (user_id, strategy_id, cash=1000000)
    │
    ▼
/api/cron/run-strategies (每个交易日 15:10 UTC 7:10)
    │
    ├─ SELECT * FROM trade260915a_strategies WHERE status='active'
    ├─ 对每个策略:
    │   1. evaluateStrategy(spec.entry, today, todayBars)
    │   2. calculateRebalancePlan(portfolio, signals, spec.holding)
    │   3. riskEngine.evaluate(plan, ctx)  ← 6 条规则顺序求值
    │   4. 对通过的 plan: PaperBroker.submitOrder()
    │   5. INSERT trade260915a_strategy_run_log (幂等)
    │
    ▼
pending orders 留在 trade260915a_orders
    │
    ▼  /api/cron/settle-pending (每 15 分钟)
    │
    ├─ SELECT * FROM trade260915a_orders WHERE status='pending'
    ├─ PaperBroker.settlePendingOrders:
    │   - BUY 与 SELL 均用"下一交易日开盘价"撮合 (T 日收盘下单 → T+1 09:30 成交)
    │   - 校验 SELL 时的 availableShares (T+1 解禁后才能卖)
    │   - 校验 BUY 时的 cash 余额
    │   - 更新 orders.status, INSERT trade260915a_fills
    │   - 更新 portfolio.cash / positions
    │
    ▼
/api/cron/t1-settle (每个交易日 09:05 UTC 1:05)
    │
    ├─ 把昨日及更早 BUY 的持仓 shares 累计到 availableShares
    ├─ 释放 BUY 冻结的资金到 cash
```

### 6.6 风控流

```
风险规则执行分两层:

Layer 1 — 立即校验 (Server Action submitOrder, Phase 3):
  - INSUFFICIENT_BUYING_POWER
  - INSUFFICIENT_SELLABLE_SHARES

Layer 2 — 调度时校验 (cron run-strategies, Phase 4):
  - MAX_POSITION_PCT (modify)
  - MAX_POSITIONS (reject)
  - MAX_DRAWDOWN_STOP (stop → portfolio.status = 'stopped')

每条规则返回 RiskDecision:
  - allow: 继续
  - modify: 应用 changes, 继续
  - reject: 跳过, 记录到 strategy_run_log
  - stop: 停止整个策略, 写 stop_reason
```

### 6.7 RLS 策略总览

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `trade260915a_quant_*` (行情) | authenticated (公共) | service_role | service_role | service_role |
| `trade260915a_strategies` | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() |
| `trade260915a_backtest_runs` | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() |
| `trade260915a_portfolios` | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() | user_id = auth.uid() |
| `trade260915a_orders` / `fills` / `positions` | 通过 portfolio JOIN | service_role | service_role | service_role |
| `trade260915a_strategy_run_log` | user_id = auth.uid() | service_role | service_role | service_role |
| `trade260915a_portfolio_equity_snapshots` | user_id = auth.uid() | service_role | service_role | service_role |

行情表**所有用户共享读**(A股行情数据本就公开),其他表全部**按 user_id 隔离**。

### 6.8 鉴权链

```
任意受保护页面:
  /strategy, /backtest, /portfolio, /market/*
    │
    ▼  middleware.ts (沿用现有 updateSession)
刷新 JWT, 不鉴权
    │
    ▼  Server Component page.tsx
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/auth/sign-in')
    │
    ▼
RLS 在查询时自动过滤
```

cron 端点鉴权独立:

```
Vercel Cron → /api/cron/*
    │
    ▼
检查 Authorization: Bearer ${CRON_SECRET}
    │
    ▼
业务逻辑使用 supabase 服务端 client (service_role key, 绕过 RLS)
```

## 7. Server / Client 边界

### 7.1 划分原则

- **Server Component 默认**: 列表 / 详情 / 报告页都不需要 `'use client'`
- **Client Component**: 含交互的组件 (表单、按钮、图表) 才加 `'use client'`
- **数据获取**: Server Component 直查 Supabase,不经过 `/api/*` JSON endpoint
- **Server Action**: 表单提交 / 状态变更走 Server Action,不引入 tRPC
- **图表**: lightweight-charts 必须 Client (canvas); 但接收 props 数据由 Server Component 准备好

### 7.2 各页面类型

| 页面 | 类型 | 说明 |
|---|---|---|
| `/strategy` | Server | 查表渲染卡片网格 |
| `/strategy/new` | Client (含子组件 Client) | 表单交互 |
| `/strategy/[id]` | Server + Client tabs | 详情 Server, 编辑/启停 Client |
| `/backtest` | Server | 列表 |
| `/backtest/[id]` | Server (含 Client 图表) | 报告页 |
| `/portfolio` | Server | 持仓表 Server, 曲线 Client |
| `/portfolio/trades` | Server | 成交明细表 |
| `/market` | Server | 股票列表 |
| `/market/[symbol]` | Server (含 Client K 线) | K 线 Client |
| `/api/cron/*` | Route Handler | 服务端定时任务 |

### 7.3 复用与禁项

- ✅ 复用 `<Button>` `<Card>` `<Tabs>` `<Alert>` `<Input>` `<Label>` (已存在)
- ✅ 复用 `<Forbidden />` 组件
- ✅ 复用 `react-hook-form` + `zod` 表单栈
- ❌ 不引入新 Client 状态库 (zustand / jotai 等)
- ❌ 不引入 tRPC / GraphQL
- ❌ 不引入 Server-Sent Events / WebSocket
- ❌ 不引入日期库 (date-fns / dayjs),用原生 Date + 自写工具

## 8. 测试策略

### 8.1 覆盖率门槛

| 模块 | 行覆盖率 | 函数覆盖率 |
|---|---|---|
| 整体 | ≥ 80% | ≥ 80% |
| `lib/backtest/*` | ≥ 90% | ≥ 90% |
| `lib/risk/*` | ≥ 90% | ≥ 90% |
| `lib/scheduler/*` | ≥ 90% | ≥ 90% |
| `lib/factors/*` | ≥ 95% | ≥ 95% |
| `app/(dashboard)/*/page.tsx` | ≥ 70% | ≥ 70% |

### 8.2 单元测试 (Vitest)

位置: 与被测文件同目录, `*.test.ts` / `*.test.tsx`。

| 测试对象 | 关键用例 |
|---|---|
| `MockDataProvider` | listSymbols 返回 ≥ 3000 只主板; getDailyBars 返回连续日期; 涨跌停硬约束 |
| 6 个因子 | 正常数据 / 数据不足 (lookback 超过历史长度) / 参数越界 |
| `compose.ts` | 合法 spec 通过 / 缺字段拒绝 / 默认值填充 |
| `evaluate.ts` | AND 全部满足 → true; OR 任一满足 → true; 比较符正确 |
| `backtest/engine.ts` | 单股 5 天确定性回测, 手算预期成交与权益 |
| `backtest/metrics.ts` | 总收益 / 最大回撤 / 夏普各 3 个用例 (正收益 / 负收益 / 横盘) |
| `backtest/fills.ts` | 涨停 BUY 拒单 / 跌停 SELL 拒单 / 整手化 / 费率计算 |
| `trading/settle.ts` | T+1 解禁: 昨日买入今日可卖; 资金到账 |
| `risk/rules.ts` (6 条) | 每条规则 allow / reject / modify / stop 各一 |
| `trading-day.ts` | 周末 / 节假日 / 工作日 |
| `time.ts` | 5 个时段边界 |

回测测试用固定 seed + Mock data,断言**具体数值**,确保算法正确。

### 8.3 集成测试 (Vitest + Supabase)

依赖本地 Supabase (开发) / 测试 project (CI)。每个 test 在事务内或 truncate-then-seed 隔离。

| 场景 | 验证点 |
|---|---|
| 策略 CRUD | RLS 隔离 (A 用户看不到 B 用户策略) |
| 回测 run 状态流转 | queued → running → completed |
| 下单 → 撮合 → 持仓变化 | 资金、股数、成本基础 |
| T+1 解禁 | 隔日后 availableShares 增加 |
| 风控触发 | modify shares / reject order / stop portfolio |
| 行情 upsert | 重复 key 走 update |
| Cron 幂等 | 重跑 run-strategies 不重复下单 |

### 8.4 E2E 测试 (Playwright)

至少 1 个端到端 journey:

```
e2e/strategy-lifecycle.spec.ts:
  1. 注册 / 登录
  2. 进入 /strategy/new
  3. 填表单 (因子: RETURN_20D > 0)
  4. 保存 → /strategy/[id]
  5. 点 "Run Backtest" → /backtest/[id]
  6. 等到 status=completed, 看到指标 + 曲线
  7. 点 "启动策略" → portfolio 创建
  8. (测试 hook: 立即触发 cron run-strategies)
  9. /portfolio 看到持仓
```

其他 E2E: `strategy-form.spec.ts` (因子动态参数)、`backtest-result.spec.ts` (报告渲染)、`portfolio-risk.spec.ts` (风控触发)。

### 8.5 不测的

- Vercel Cron 基础设施本身 (测其调用的纯函数)
- 第三方 API (本期无,未来用 MSW/nock mock)
- 纯展示组件 wrapper

## 9. 实施顺序 (5 个 Phase)

每个 phase 走一次 `writing-plans` 循环,产出独立的 plan 文档。

### Phase 0 — Schema + 数据层 Mock (0.5 周)

**任务**:
- [ ] Migration `002_quant_schema.sql`: 行情表 + RLS
- [ ] `lib/data/provider.ts` 接口
- [ ] `lib/data/adapters/mock.ts` (确定性伪随机)
- [ ] `lib/data/ingest.ts` + `query.ts`
- [ ] `lib/scheduler/trading-day.ts` + `time.ts`
- [ ] Cron: `/api/cron/ingest-daily` + `/api/cron/ingest-minute`
- [ ] `vercel.json` cron 配置
- [ ] 页面: `/market` 列表 + `/market/[symbol]` K 线
- [ ] 测试: provider / ingest / query / scheduler

**DoD**: ingest-daily 跑一次能看到数据; `/market/[symbol]` 显示 K 线。

### Phase 1 — 因子层 + 策略表达 (1 周)

**任务**:
- [ ] `lib/factors/*` 6 个因子 + registry
- [ ] `lib/strategy/types.ts` (StrategySpec + zod)
- [ ] `lib/strategy/compose.ts` + `evaluate.ts`
- [ ] `lib/strategy/actions.ts` (Server Actions CRUD)
- [ ] `<StrategyForm>` + 子组件
- [ ] 页面: `/strategy` 列表 / `/strategy/new` / `/strategy/[id]`
- [ ] i18n: `quant.strategy.*` / `quant.factor.*`
- [ ] 测试: 因子 / 校验 / evaluate / form submit

**DoD**: 用户能创建并保存策略, 列表显示自己的策略。

### Phase 2 — 回测引擎 + 回测 UI (1 周)

**任务**:
- [ ] `lib/backtest/engine.ts` 主循环
- [ ] `lib/backtest/fills.ts` (撮合 + 费率 + 涨跌停)
- [ ] `lib/backtest/metrics.ts` (5 个指标)
- [ ] `lib/backtest/actions.ts` (Server Action)
- [ ] 引入 lightweight-charts
- [ ] `<EquityCurveChart>` + `<KlineChart>` + `<MetricsTable>`
- [ ] 页面: `/backtest` 列表 / `/backtest/[id]` 报告
- [ ] Migration: `trade260915a_backtest_runs`
- [ ] 测试: 引擎确定性 / 指标 / fills

**DoD**: 用户能从策略页运行回测,看到完整报告。

### Phase 3 — 模拟交易 + 持仓 UI (1.5 周)

**任务**:
- [ ] `lib/trading/broker.ts` 接口
- [ ] `lib/trading/adapters/paper.ts` (订单状态机)
- [ ] `lib/trading/settle.ts` (T+1)
- [ ] `lib/trading/orders.ts` + `actions.ts`
- [ ] Migration: `trade260915a_portfolios` / `positions` / `orders` / `fills` / `strategy_run_log`
- [ ] Cron: `/api/cron/run-strategies` + `/api/cron/settle-pending` + `/api/cron/t1-settle`
- [ ] 页面: `/portfolio` + `/portfolio/trades`
- [ ] "启动策略" UI
- [ ] 测试: 订单状态机 / T+1 / RLS / cron 幂等

**DoD**: 启动策略后, cron 收盘调仓, 生成订单; /portfolio 看到持仓。

### Phase 4 — 风控 + 调度完善 + 实盘接口预留 (1.5 周)

**任务**:
- [ ] `lib/risk/rules.ts` (6 条规则)
- [ ] `lib/risk/engine.ts` (规则引擎)
- [ ] `lib/risk/peak.ts` + `messages.ts`
- [ ] 集成 riskEngine 到 `/api/cron/run-strategies`
- [ ] `trade260915a_portfolio_equity_snapshots` 表
- [ ] 收盘记录 equity snapshot
- [ ] 风控错误 i18n (`quant.risk.*`)
- [ ] cron 端点错误重试 + 告警日志
- [ ] `lib/trading/broker.ts` 接口扩展 (实盘字段预留)
- [ ] `lib/trading/adapters/README.md` (实盘接入指南)
- [ ] `lib/data/adapters/README.md` (真实数据源指南)
- [ ] 测试: 6 条规则全覆盖 / 风控集成

**DoD**: maxDrawdownPct=5% 策略触发止损, portfolio 停止; 实盘接口有清晰文档。

### 与 writing-plans 的衔接

每个 phase:
1. 提交并 push 当前 phase 代码
2. 运行 `writing-plans` 技能, 产出 `docs/superpowers/plans/<date>-phase<N>-<topic>.md`
3. 用户按 plan 逐项实现

## 10. 风险与注意事项

### R1 — Vercel Cron 时间限制

Vercel Hobby plan 单次 cron 10s、Pro 60s、Enterprise 5min。本设计所有 cron 端点应**严格控制在 60s 内**。

缓解:
- 回测走 Server Action 同步调用 (短任务,非 cron)
- `run-strategies` 涉及主板 3000 股评估, MVP 控制在 60s 内 (本地测试过); 未来超时分批
- `settle-pending` 只处理 pending 订单,通常 < 100 单
- `ingest-daily` Mock 数据秒级返回

### R2 — 节假日表过期

`HOLIDAYS_2026` 是硬编码表。每年 12 月国务院办公厅发布次年节假日通知,需要**手动更新**。

缓解:
- 在 README 写明"每年 12 月更新节假日表"
- 加 unit test 验证当前年份的节假日
- Phase 4 末期考虑: 解析国务院通知 (人工 / 半自动)

### R3 — Mock 数据真实性

Mock 数据用 GBM 生成, 与真实 A 股**形态相似但非真数据**, 不能用于投资决策。

缓解:
- 文档明确标注 "Mock 数据仅用于本地开发与测试"
- /market/[symbol] 顶部 Alert: "展示数据为模拟数据,非真实行情"
- 真实数据源接入后 Alert 自动消失 (通过环境变量判断)

### R4 — 分钟线存储膨胀

主板 3000 股 × 240 分钟/日 × 250 日/年 × 5 年 = 9 亿行。Postgres + 分区可扛但接近极限。

缓解:
- 按月份分区, 冷数据可独立 detach 到冷存储 (本期不做)
- 分钟线只保留 1 年内数据 (历史回测优先用日线); 这是后续 phase 决策
- 真实数据源接入后再做容量规划

### R5 — T+1 实时性

cron `t1-settle` 每日 09:05 触发, 但 09:30 之前可能有 SELL 订单被 settle-pending 抢先撮合。

缓解:
- settle-pending 在 09:05 之前不触发 (本期配置: 交易时段 09:35+)
- /api/cron/t1-settle 是显式序, 09:05 跑完后 settle-pending 才允许触发

### R6 — RLS 性能

`trade260915a_orders` 等通过 portfolio JOIN 鉴权, 频繁查询可能慢。

缓解:
- 索引: `(portfolio_id, status)`, `(user_id, status)` (后续 phase 视情况加)
- 服务端查询走 service_role 绕过 RLS, 客户端直查才走 RLS

### R7 — 因子计算的数据需求

因子 lookback 60 天, 上市不满 60 天的新股返回 null, 策略求值需处理 null。

缓解:
- `evaluate.ts` 显式处理: null 视为不满足
- UI 在策略页提示"新股不参与"

### R8 — 风控回撤的 peak equity 准确度

peakEquity 来自 `trade260915a_portfolio_equity_snapshots` 的 MAX(equity)。如果某天 cron 失败漏记, peak 偏低, 可能误触发止损。

缓解:
- cron 失败有告警日志 (Phase 4)
- 漏记一天影响有限 (一两天内回撤通常不会突然触发)

### R9 — 时区转换

Vercel Cron UTC, 业务北京时间 UTC+8。本设计 hard-code 转换, 夏令时变化 (UTC 不会变, 北京时间也不会变) 不影响。

缓解:
- 在 `scheduler/time.ts` 加注释明确 UTC ↔ 北京换算
- 单元测试覆盖 09:30 / 11:30 / 13:00 / 15:00 边界

### R10 — 实时行情延迟

Vercel Cron 5 分钟频率, 分钟线最坏延迟 5 分钟。对日线策略无影响, 对分钟策略会错过最优点。

缓解:
- 文档说明"分钟策略理论延迟 ≤ 5 分钟"
- 实盘 Broker 接入后改用券商推送 (本期不做)

## 11. 后续扩展 (本轮不做)

- 实盘券商对接 (CTP / XTP / 恒生UFT / 掘金仿真)
- 真实数据源 (Tushare Pro / AkShare / 通联)
- 创业板 / 科创板 / 北交所 / ETF / 可转债
- ST / 新股首日 ±20% / ±30% 等特殊规则
- 策略 DSL / Python 沙箱 / 可视化拖拽
- 因子自定义公式与新因子插件
- 分钟级实时调仓 / 高频 Tick 交易
- 多账户 / 跨策略组合级别风控
- 因子 IC / Alpha / Beta / 因子暴露等高级回测指标
- 因子历史回放 / 因子贡献归因 / 收益归因
- 策略分享 / 公开策略广场 / 跟单
- 实时 WebSocket 推送
- 多语言扩展 (日语 / 韩语)
- 手机端适配
- 回测任务队列异步化 (本期同步跑, 超过 5s 留接缝)
- 增强 RLS (按角色 / 按策略共享)
- 分钟线冷数据归档到 S3 / R2
- 节假日自动更新 (爬虫 / LLM 解析通知)
- 实盘 Broker 的风控加固 (人工确认大额订单 / 短信告警)

## 12. 变更日志

- 2026-09-15: 初稿, 经 brainstorming 11 问澄清 (范围/数据源/交易模式/策略表达/用户模型/频率/资产范围/部署/回测保真度/风控/因子库), 11 节设计评审, 用户已确认。
