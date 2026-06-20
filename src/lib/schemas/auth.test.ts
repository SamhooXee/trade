import { describe, it, expect } from 'vitest'
import { signInSchema, signUpSchema } from './auth'

describe('signInSchema', () => {
  it('accepts valid email + password (≥6)', () => {
    const r = signInSchema.safeParse({ email: 'a@b.com', password: '123456' })
    expect(r.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const r = signInSchema.safeParse({ email: 'not-email', password: '123456' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.email?.[0]).toMatch(/邮箱|email/i)
  })

  it('rejects password shorter than 6', () => {
    const r = signInSchema.safeParse({ email: 'a@b.com', password: '12345' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.password?.[0]).toBeTruthy()
  })
})

describe('signUpSchema', () => {
  it('accepts valid 8+ char password with digit + matching confirm', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.com', password: 'password1', confirmPassword: 'password1',
    })
    expect(r.success).toBe(true)
  })

  it('rejects password without digit', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.com', password: 'abcdefgh', confirmPassword: 'abcdefgh',
    })
    expect(r.success).toBe(false)
  })

  it('rejects mismatched confirmPassword', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.com', password: 'password1', confirmPassword: 'password2',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.confirmPassword?.[0]).toMatch(/不一致|match/i)
    }
  })
})
