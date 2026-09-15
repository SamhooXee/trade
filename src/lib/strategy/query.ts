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