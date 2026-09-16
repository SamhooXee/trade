import { createClient } from '@/lib/supabase/server'
import { getServiceRoleClient } from '@/lib/supabase/service-role'
import type { EquitySnapshot } from '@/lib/trading/types'
import {
  fromDbEquitySnapshotRow,
  toDbEquitySnapshotRow,
} from './equity-snapshot'

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
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolio_equity_snapshots')
    .upsert(toDbEquitySnapshotRow(input), {
      onConflict: 'portfolio_id,trade_date',
    })
    .select('*')
    .single()
  if (error)
    throw new Error(`upsertEquitySnapshotService failed: ${error.message}`)
  return fromDbEquitySnapshotRow(data)
}

/** 拉一个 portfolio 全部 snapshots(按 trade_date DESC) */
export async function listSnapshotsByPortfolioService(
  portfolioId: string,
): Promise<EquitySnapshot[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('trade260915a_portfolio_equity_snapshots')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: false })
  if (error)
    throw new Error(
      `listSnapshotsByPortfolioService failed: ${error.message}`,
    )
  return (data ?? []).map(fromDbEquitySnapshotRow)
}