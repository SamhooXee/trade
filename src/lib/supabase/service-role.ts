import { createClient } from '@supabase/supabase-js'

/**
 * service-role client。绕过 RLS,仅用于服务端 cron / 后台任务 / 测试。
 * 严禁在浏览器或 Server Component 内调用 — 会泄露 service_role key。
 */

let cached: ReturnType<typeof createClient> | null = null

export function getServiceRoleClient() {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cached
}