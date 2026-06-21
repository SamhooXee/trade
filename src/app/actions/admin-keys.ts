'use server'

import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
import { keyService } from '@/lib/services/key-service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const generateKeysSchema = z.object({
  points: z.coerce.number().int().min(1, '积分必须大于0 / Points must be positive'),
  expiresIn: z.coerce.number().int().min(1, '天数必须大于0 / Lifespan must be positive'),
  quantity: z.coerce.number().int().min(1, '数量必须大于0 / Quantity must be positive').max(100, '一次最多生成100个 / Max 100 keys at once'),
})

export type AdminKeyFormState = {
  success?: boolean
  error?: string
  fieldErrors?: {
    points?: string[]
    expiresIn?: string[]
    quantity?: string[]
  }
} | null

/**
 * Server Action for admin to generate keys
 */
export async function generateKeysAction(
  _prev: AdminKeyFormState,
  formData: FormData
): Promise<AdminKeyFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user)) {
    return { error: '未授权：需要管理员权限 / Unauthorized: Admin privileges required' }
  }

  const parsed = generateKeysSchema.safeParse({
    points: formData.get('points'),
    expiresIn: formData.get('expiresIn'),
    quantity: formData.get('quantity'),
  })

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await keyService.generateKeys(supabase, {
      points: parsed.data.points,
      expiresIn: parsed.data.expiresIn,
      quantity: parsed.data.quantity,
    })

    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '生成失败 / Generation failed' }
  }
}

/**
 * Server Action to delete a key by ID
 */
export async function deleteKeyAction(id: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user)) {
    return { error: '未授权：需要管理员权限 / Unauthorized: Admin privileges required' }
  }

  try {
    await keyService.deleteKey(supabase, id)
    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '删除失败 / Deletion failed' }
  }
}
