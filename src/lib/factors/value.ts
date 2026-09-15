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