type AuthErrorLike = { code?: string; message?: string }

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'errors.invalid_credentials',
  user_already_exists: 'errors.user_already_exists',
  email_exists: 'errors.email_exists',
  weak_password: 'errors.weak_password',
  email_address_invalid: 'errors.email_address_invalid',
  over_email_send_rate_limit: 'errors.over_email_send_rate_limit',
  signup_disabled: 'errors.signup_disabled',
}

const FALLBACK = 'errors.fallback'

export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return FALLBACK
  const code = error.code
  if (code && code in MESSAGES) return MESSAGES[code]
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[mapAuthError] unmapped code:', code, 'message:', error.message)
  }
  return FALLBACK
}