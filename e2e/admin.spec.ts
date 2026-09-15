import { test, expect } from '@playwright/test'

/**
 * 手工前置:
 * 1. 注册一个 admin 账号(走 / 的 sign-up 流程),例如 admin-e2e@trade-test.com
 * 2. 退出登录
 * 3. Supabase Dashboard → Authentication → Users → 该用户
 *    → Raw App Meta Data,写入 {"role": "admin"}
 * 4. 用该账号重新登录
 * 5. 启动 dev server: pnpm dev
 * 6. 跑本测试: pnpm test:e2e e2e/admin.spec.ts
 */

test.describe('/admin 鉴权', () => {
  test('未登录访问 /admin → 重定向到 /', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/$/)
  })

  test('非 admin 登录用户访问 /admin → 看到 403 页面(URL 保留)', async ({ page }) => {
    // 假设测试夹具里有普通账号;具体账号来源由 playwright.config.ts / global setup 决定
    await page.goto('/signin-fixture-non-admin')
    // 简化:本测试运行依赖具体登录注入方式,这里只断言 URL 与文案
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText(/403 - 无权限/)).toBeVisible()
    await expect(page.getByText(/Admin 控制台/)).not.toBeVisible()
  })

  test('admin 登录用户访问 /admin → 看到 Admin 控制台', async ({ page }) => {
    await page.goto('/signin-fixture-admin')
    await page.goto('/admin')
    await expect(page.getByText('Admin 控制台 / Admin Console')).toBeVisible()
  })
})
