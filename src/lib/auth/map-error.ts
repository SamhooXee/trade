type AuthErrorLike = { code?: string; message?: string }

const MESSAGES: Record<string, string> = {
  invalid_credentials: '邮箱或密码错误 / Invalid email or password',
  user_already_exists: '该邮箱已注册 / Email already registered',
  email_exists: '该邮箱已注册 / Email already registered',
  weak_password: '密码至少 8 位且包含数字 / Password must be 8+ chars and include a number',
  email_address_invalid: '邮箱格式不正确 / Invalid email format',
  over_email_send_rate_limit: '请求过于频繁,请稍后再试 / Too many requests, please try again',
  signup_disabled: '注册已关闭 / Sign-up is disabled',
}

const FALLBACK = '出了点问题,请重试 / Something went wrong, please try again'

export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return FALLBACK
  const code = error.code
  if (code && code in MESSAGES) return MESSAGES[code]
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[mapAuthError] unmapped code:', code, 'message:', error.message)
  }
  return FALLBACK
}