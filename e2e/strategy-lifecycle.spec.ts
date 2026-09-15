import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-strategy-${Date.now()}@example.com`
const TEST_PASSWORD = 'password123'

test('strategy lifecycle: sign up → create strategy → see in list → view detail', async ({ page }) => {
  // 1. 注册
  await page.goto('/auth/sign-up')
  await page.getByLabel(/邮箱|email/i).fill(TEST_EMAIL)
  await page.getByLabel(/^密码$|^password$/i).fill(TEST_PASSWORD)
  const confirm = page.getByLabel(/确认密码|confirm password/i)
  if (await confirm.count()) await confirm.fill(TEST_PASSWORD)
  await page.getByRole('button', { name: /注册|sign up/i }).click()
  await page.waitForURL(/\/dashboard/)

  // 2. 进入 strategy 列表
  await page.goto('/strategy')
  await expect(page.getByRole('heading', { name: /我的策略|my strategies/i })).toBeVisible()

  // 3. 新建
  await page.getByRole('link', { name: /新建策略|new strategy/i }).click()
  await page.waitForURL(/\/strategy\/new/)

  // 4. 填表
  await page.getByLabel(/策略名称|strategy name/i).fill('E2E 策略')
  // 默认有一个空 entry 块, 添加条件
  await page.getByRole('button', { name: /添加条件|add condition/i }).first().click()
  // 阈值默认 0,直接保存
  await page.getByRole('button', { name: /保存草稿|save draft/i }).click()

  // 5. 详情页
  await page.waitForURL(/\/strategy\/[a-f0-9-]+$/)

  // 6. 返回列表,确认看到新建的策略
  await page.goto('/strategy')
  await expect(page.getByText('E2E 策略')).toBeVisible()

  // 7. 启动
  await page.getByText('E2E 策略').click()
  await page.waitForURL(/\/strategy\/[a-f0-9-]+$/)
  await page.getByRole('button', { name: /启动|start/i }).click()
  await expect(page.getByText(/运行中|active/i)).toBeVisible()
})