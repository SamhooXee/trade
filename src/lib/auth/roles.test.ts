import { describe, it, expect } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { isAdmin } from './roles'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'u@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  } as User
}

describe('isAdmin', () => {
  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false)
  })

  it('returns false when app_metadata is undefined', () => {
    const user = { id: 'u1', app_metadata: undefined } as unknown as User
    expect(isAdmin(user)).toBe(false)
  })

  it('returns false when app_metadata has no role', () => {
    expect(isAdmin(makeUser({ app_metadata: {} }))).toBe(false)
  })

  it('returns false when role is not "admin"', () => {
    expect(isAdmin(makeUser({ app_metadata: { role: 'user' } }))).toBe(false)
  })

  it('returns true when role is "admin"', () => {
    expect(isAdmin(makeUser({ app_metadata: { role: 'admin' } }))).toBe(true)
  })

  it('returns true when app_metadata has other fields alongside admin role', () => {
    expect(
      isAdmin(makeUser({ app_metadata: { role: 'admin', foo: 'bar' } })),
    ).toBe(true)
  })

  it('returns false when only user_metadata has admin role (security-critical)', () => {
    expect(isAdmin(makeUser({ user_metadata: { role: 'admin' } }))).toBe(false)
  })
})
