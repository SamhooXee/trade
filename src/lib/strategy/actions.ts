'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { composeStrategy } from './compose'
import { type StrategySpec, type StrategyStatus } from './types'

// Server Actions 通过 e2e 覆盖。supabase 客户端类型化插入在 .from() 上与本项目已知的
// 类型推导行为不兼容;这里用 `as any` 绕过,保留运行时行为。
type AnyClient = { from: (t: string) => any; auth: { getUser: () => Promise<any> } }

export type StrategyFormState = {
  error?: string
  fieldErrors?: Record<string, string[]>
} | null

/**
 * 创建策略。返回新策略 id 后由调用方重定向。
 * 失败时返回 fieldErrors 用于表单回显。
 */
export async function createStrategyAction(
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const supabase = (await createClient()) as AnyClient
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const name = String(formData.get('name') ?? '').trim()
  const specRaw = String(formData.get('spec') ?? '')
  const mode = String(formData.get('mode') ?? 'draft')

  if (!name) return { fieldErrors: { name: ['quant.errors.name_required'] } }
  if (name.length > 100) return { fieldErrors: { name: ['quant.errors.name_too_long'] } }

  let spec: StrategySpec
  try {
    spec = composeStrategy(JSON.parse(specRaw))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'quant.errors.invalid_spec'
    return { fieldErrors: { spec: [message] } }
  }

  const status: StrategyStatus = mode === 'enable' ? 'active' : 'draft'

  const { data, error } = await supabase
    .from('trade260915a_strategies')
    .insert({ user_id: user.id, name, spec, status })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/strategy')
  redirect(`/strategy/${data.id}`)
}

/**
 * 更新策略(spec + name)。状态走单独 action。
 */
export async function updateStrategyAction(
  id: string,
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const supabase = (await createClient()) as AnyClient
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const name = String(formData.get('name') ?? '').trim()
  const specRaw = String(formData.get('spec') ?? '')

  if (!name) return { fieldErrors: { name: ['quant.errors.name_required'] } }
  if (name.length > 100) return { fieldErrors: { name: ['quant.errors.name_too_long'] } }

  let spec: StrategySpec
  try {
    spec = composeStrategy(JSON.parse(specRaw))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'quant.errors.invalid_spec'
    return { fieldErrors: { spec: [message] } }
  }

  const { error } = await supabase
    .from('trade260915a_strategies')
    .update({ name, spec })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${id}`)
  return null
}

/** 设置状态:draft / active / paused / archived */
export async function setStrategyStatusAction(
  id: string,
  status: StrategyStatus,
): Promise<{ error?: string }> {
  const supabase = (await createClient()) as AnyClient
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  // zod 形状校验已在 types.ts 编译期完成,运行时 status 类型由 StrategyStatus 约束
  const { error } = await supabase
    .from('trade260915a_strategies')
    .update({ status })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/strategy')
  revalidatePath(`/strategy/${id}`)
  return {}
}