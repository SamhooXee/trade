'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const redeemKeySchema = z.object({
  code: z.string().min(1, '请输入激活码 / Key code is required').trim(),
})

export type RedeemFormState = {
  success?: boolean
  points?: number
  newBalance?: number
  error?: string
  fieldErrors?: {
    code?: string[]
  }
} | null

/**
 * Server Action for users to redeem an activation key
 */
export async function redeemKeyAction(
  _prev: RedeemFormState,
  formData: FormData
): Promise<RedeemFormState> {
  const parsed = redeemKeySchema.safeParse({
    code: formData.get('code'),
  })

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: '未登录，请先登录 / Unauthorized: Please sign in first' }
  }

  try {
    const { data, error } = await supabase.rpc('block1_redeem_key', {
      key_code: parsed.data.code,
      user_id: user.id,
    })

    if (error) {
      return { error: error.message }
    }

    const result = data as {
      success: boolean
      points?: number
      newBalance?: number
      message: string
    }

    if (!result.success) {
      return { error: result.message }
    }

    revalidatePath('/dashboard')
    return {
      success: true,
      points: result.points,
      newBalance: result.newBalance,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '兑换失败，发生未知错误 / Redemption failed due to unknown error' }
  }
}
