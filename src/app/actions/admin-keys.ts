'use server'

import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
import { keyService } from '@/lib/services/key-service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const generateKeysSchema = z.object({
  points: z.coerce.number().int().min(1, 'errors.points_positive'),
  expiresIn: z.coerce.number().int().min(1, 'errors.lifespan_positive'),
  quantity: z.coerce.number().int().min(1, 'errors.quantity_positive').max(100, 'errors.quantity_max'),
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
    return { error: 'errors.adminRequired' }
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
    return { error: err instanceof Error ? err.message : 'errors.fallback' }
  }
}

/**
 * Server Action to delete a key by ID
 */
export async function deleteKeyAction(id: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user)) {
    return { error: 'errors.adminRequired' }
  }

  try {
    await keyService.deleteKey(supabase, id)
    revalidatePath('/admin')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'errors.fallback' }
  }
}

