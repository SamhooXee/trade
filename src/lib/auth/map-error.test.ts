import { describe, it, expect } from 'vitest'
import { mapAuthError } from './map-error'

describe('mapAuthError', () => {
  it('maps invalid_credentials', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toMatch(/邮箱或密码|Invalid email or password/)
  })
  it('maps user_already_exists', () => {
    expect(mapAuthError({ code: 'user_already_exists' })).toMatch(/已注册|already registered/i)
    expect(mapAuthError({ code: 'email_exists' })).toMatch(/已注册|already registered/i)
  })
  it('maps weak_password', () => {
    expect(mapAuthError({ code: 'weak_password' })).toMatch(/8 位|chars/i)
  })
  it('maps email_address_invalid', () => {
    expect(mapAuthError({ code: 'email_address_invalid' })).toMatch(/邮箱|email format/i)
  })
  it('maps over_email_send_rate_limit', () => {
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toMatch(/过于频繁|too many/i)
  })
  it('maps signup_disabled', () => {
    expect(mapAuthError({ code: 'signup_disabled' })).toMatch(/注册已关闭|disabled/i)
  })
  it('falls back to generic for unknown codes', () => {
    expect(mapAuthError({ code: 'something_weird' })).toMatch(/出了点问题|something went wrong/i)
  })
  it('falls back to generic when no code', () => {
    expect(mapAuthError({})).toMatch(/出了点问题|something went wrong/i)
  })
})