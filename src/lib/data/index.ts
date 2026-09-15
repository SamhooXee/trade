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