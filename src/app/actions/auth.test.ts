import { describe, it, expect, vi, beforeEach } from 'vitest'

// mocks 必须先于被测模块 import
const { mockSignInWithPassword, mockSignUp, mockSignOut, mockRedirect } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockRedirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { signInAction, signUpAction, signOutAction } from './auth'

beforeEach(() => {
  vi.clearAllMocks()
})

function fd(obj: Record<string, string>): FormData {
  const f = new FormData()
  Object.entries(obj).forEach(([k, v]) => f.append(k, v))
  return f
}

describe('signInAction', () => {
  it('returns fieldErrors on invalid zod input', async () => {
    const state = await signInAction(null, fd({ email: 'bad', password: '1' }))
    expect(state?.fieldErrors?.email).toBeTruthy()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('returns error on invalid_credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials' } })
    const state = await signInAction(null, fd({ email: 'a@b.com', password: '123456' }))
    expect(state?.error).toBe('errors.invalid_credentials')
  })

  it('redirects to /dashboard on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null })
    await expect(signInAction(null, fd({ email: 'a@b.com', password: '123456' })))
      .rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('signUpAction', () => {
  it('returns fieldErrors on weak password', async () => {
    const state = await signUpAction(null, fd({ email: 'a@b.com', password: 'short', confirmPassword: 'short' }))
    expect(state?.fieldErrors?.password).toBeTruthy()
  })

  it('returns error on user_already_exists', async () => {
    mockSignUp.mockResolvedValueOnce({ error: { code: 'user_already_exists' } })
    const state = await signUpAction(null, fd({ email: 'a@b.com', password: 'password1', confirmPassword: 'password1' }))
    expect(state?.error).toBe('errors.user_already_exists')
  })


  it('redirects to /dashboard on success', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    await expect(signUpAction(null, fd({ email: 'a@b.com', password: 'password1', confirmPassword: 'password1' })))
      .rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('signOutAction', () => {
  it('calls signOut and redirects to /', async () => {
    const empty = new FormData()
    await expect(signOutAction(empty)).rejects.toThrow('REDIRECT:/')
    expect(mockSignOut).toHaveBeenCalled()
  })
})