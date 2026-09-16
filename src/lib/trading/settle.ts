import type { Fill, Position } from './types'

interface ComputeT1UnlockInput {
  today: string // YYYY-MM-DD
  /** 昨日成交的 fills(由 cron 传入) */
  yesterdayFills: Fill[]
  /** 当前持仓(由 cron 传入) */
  positions: Map<string, Position>
}

export interface T1UnlockUpdate {
  symbolCode: string
  availableShares: number // 解禁后的新值(覆盖写)
}

/**
 * 计算 T+1 解禁:T+1 09:05 把昨日 BUY fill 的股数累加到 positions.available_shares。
 * 纯函数,不写库。调用方负责持久化。
 *
 * 规则:
 *  - 只处理 side = 'BUY' 的 fill
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