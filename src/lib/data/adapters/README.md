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