'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const redeemKeySchema = z.object({
  code: z.string().min(1, 'errors.key_required').trim(),
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
    return { error: 'errors.unauthorized' }
  }


  try {
    const { data, error } = await supabase.rpc('trade260915a_redeem_key', {
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
    return { error: err instanceof Error ? err.message : 'errors.fallback' }
  }
}

