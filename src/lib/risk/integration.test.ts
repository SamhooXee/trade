import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  upsertEquitySnapshotService,
  listSnapshotsByPortfolioService,
} from './query'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  describe.skip('integration (skipped — Supabase not configured)', () => {
    it('placeholder', () => {})
  })
} else {
  const admin = createClient(URL, SERVICE_KEY)

  // 测试用常量(UUID 任意;user_id 必须存在于 auth.users,否则 FK 失败)
  const TEST_EMAIL = 'risk-integration-test@example.com'
  const PORTFOLIO = '44444444-4444-4444-4444-444444444444'
  let USER_ID = '55555555-5555-5555-5555-555555555555'

  beforeAll(async () => {
    try {
      const created = await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: 'test-password-12345',
        email_confirm: true,
      })
      if (created.data.user?.id) USER_ID = created.data.user.id
    } catch {
      // 已存在则忽略;从已存在 user 中查 id
      const { data } = await admin.auth.admin.listUsers()
      const found = data?.users.find((u) => u.email === TEST_EMAIL)
      if (found) USER_ID = found.id
    }
    await admin
      .from('trade260915a_portfolio_equity_snapshots')
      .delete()
      .eq('portfolio_id', PORTFOLIO)
  })

  describe('upsertEquitySnapshotService — idempotency', () => {
    it('upsert twice on same (portfolio, trade_date) returns same row', async () => {
      const r1 = await upsertEquitySnapshotService({
        userId: USER_ID,
        portfolioId: PORTFOLIO,
        tradeDate: '2026-09-15',
        equity: 1_000_000,
        cash: 500_000,
        marketValue: 500_000,
      })
      const r2 = await upsertEquitySnapshotService({
        userId: USER_ID,
        portfolioId: PORTFOLIO,
        tradeDate: '2026-09-15',
        equity: 1_050_000,
        cash: 500_000,
        marketValue: 550_000, // update
      })
      expect(r1.tradeDate).toBe('2026-09-15')
      expect(r2.id).toBe(r1.id) // upsert 后 id 不变
      expect(r2.equity).toBe(1_050_000) // 值已更新
    })
  })

  describe('listSnapshotsByPortfolioService', () => {
    it('returns DESC sorted snapshots', async () => {
      await upsertEquitySnapshotService({
        userId: USER_ID,
        portfolioId: PORTFOLIO,
        tradeDate: '2026-09-13',
        equity: 900_000,
        cash: 500_000,
        marketValue: 400_000,
      })
      await upsertEquitySnapshotService({
        userId: USER_ID,
        portfolioId: PORTFOLIO,
        tradeDate: '2026-09-14',
        equity: 950_000,
        cash: 500_000,
        marketValue: 450_000,
      })
      const list = await listSnapshotsByPortfolioService(PORTFOLIO)
      expect(list.length).toBeGreaterThanOrEqual(3)
      expect(list[0].tradeDate).toBe('2026-09-15')
      expect(list[1].tradeDate).toBe('2026-09-14')
      expect(list[2].tradeDate).toBe('2026-09-13')
    })
  })
}