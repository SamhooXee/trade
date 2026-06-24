import { describe, it, expect } from 'vitest'
import { mapAuthError } from './map-error'

describe('mapAuthError', () => {
  it('maps invalid_credentials', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toBe('errors.invalid_credentials')
  })
  it('maps user_already_exists', () => {
    expect(mapAuthError({ code: 'user_already_exists' })).toBe('errors.user_already_exists')
    expect(mapAuthError({ code: 'email_exists' })).toBe('errors.email_exists')
  })
  it('maps weak_password', () => {
    expect(mapAuthError({ code: 'weak_password' })).toBe('errors.weak_password')
  })
  it('maps email_address_invalid', () => {
    expect(mapAuthError({ code: 'email_address_invalid' })).toBe('errors.email_address_invalid')
  })
  it('maps over_email_send_rate_limit', () => {
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toBe('errors.over_email_send_rate_limit')
  })
  it('maps signup_disabled', () => {
    expect(mapAuthError({ code: 'signup_disabled' })).toBe('errors.signup_disabled')
  })
  it('falls back to generic for unknown codes', () => {
    expect(mapAuthError({ code: 'something_weird' })).toBe('errors.fallback')
  })
  it('falls back to generic when no code', () => {
    expect(mapAuthError({})).toBe('errors.fallback')
  })
})