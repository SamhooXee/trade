import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import {
  listFillsByDateService,
  listPositionsService,
  updatePositionAvailableSharesService,
} from '@/lib/trading/query'
import { computeT1Unlock } from '@/lib/trading/settle'
import type { Fill } from '@/lib/trading/types'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authErr = checkCronAuth(req)
  if (authErr) return authErr

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const yesterdayFills = await listFillsByDateService(yesterday)
  if (yesterdayFills.length === 0) {
    return NextResponse.json({
      today,
      yesterday,
      unlockedPortfolios: 0,
      updates: 0,
    })
  }

  // 按 portfolio 分组
  const byPortfolio = new Map<string, Fill[]>()
  for (const f of yesterdayFills) {
    const list = byPortfolio.get(f.portfolioId) ?? []
    list.push(f)
    byPortfolio.set(f.portfolioId, list)
  }

  let totalPortfolios = 0
  let totalUpdates = 0

  for (const [portfolioId, fills] of byPortfolio) {
    const positions = await listPositionsService(portfolioId)
    const positionsMap = new Map(positions.map((p) => [p.symbolCode, p]))

    const updates = computeT1Unlock({
      today,
      yesterdayFills: fills,
      positions: positionsMap,
    })

    for (const u of updates) {
      await updatePositionAvailableSharesService(
        portfolioId,
        u.symbolCode,
        u.availableShares,
      )
      totalUpdates += 1
    }
    if (updates.length > 0) totalPortfolios += 1
  }

  return NextResponse.json({
    today,
    yesterday,
    unlockedPortfolios: totalPortfolios,
    updates: totalUpdates,
  })
}