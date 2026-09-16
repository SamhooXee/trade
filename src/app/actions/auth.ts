'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signInSchema, signUpSchema } from '@/lib/schemas/auth'
import { mapAuthError } from '@/lib/auth/map-error'

export type FormState = {
  error?: string
  fieldErrors?: {
    email?: string[]
    password?: string[]
    confirmPassword?: string[]
  }
} | null

type FieldErrors = NonNullable<FormState>['fieldErrors']

function flattenZod(err: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): FieldErrors {
  const flat = err.flatten().fieldErrors
  return {
    email: flat.email,
    password: flat.password,
    confirmPassword: flat.confirmPassword,
  }
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { fieldErrors: flattenZod(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: mapAuthError(error) }

  redirect('/market')
}

export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { fieldErrors: flattenZod(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: mapAuthError(error) }

  redirect('/market')
}

export async function signOutAction(_formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}