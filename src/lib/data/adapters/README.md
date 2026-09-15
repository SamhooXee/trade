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