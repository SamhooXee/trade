import { describe, it, expect } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TEST_USER_A = '11111111-1111-1111-1111-111111111111'
const TEST_USER_B = '22222222-2222-2222-2222-222222222222'
const TEST_STRATEGY = '33333333-3333-3333-3333-333333333333'

if (!URL || !SERVICE_KEY) {
  describe.skip('integration', () => {
    it('skipped — Supabase not configured', () => {})
  })
} else {
  describe('idempotency (smoke)', () => {
    it('insertOrderService and insertRunLogService can be imported', async () => {
      const query = await import('./query')
      expect(typeof query.insertOrderService).toBe('function')
      expect(typeof query.insertRunLogService).toBe('function')
      expect(typeof query.cancelOrderIfPendingService).toBe('function')
    })
  })

  describe('RLS isolation (skipped — needs test JWT)', () => {
    // 完整 RLS 隔离测试需要本地 supabase + test users;本期手动验证。
    it.skip('user A cannot see user B portfolios via RLS client', () => {})
    it.skip('user B cannot see user A fills via RLS client', () => {})
  })
}

void TEST_USER_A
void TEST_USER_B
void TEST_STRATEGY