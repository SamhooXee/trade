# Block1 Admin 角色 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有登录体系上增加 admin 角色鉴权:`app_metadata.role === 'admin'` 的用户访问 `/admin` 看到占位控制台,非 admin 看到 403 页面,未登录重定向到 `/`。

**Architecture:** Server Component 在 `src/app/admin/page.tsx` 内完成鉴权(读 `getUser()` + `isAdmin` 纯函数分支渲染);`isAdmin` 抽到 `src/lib/auth/roles.ts` 单测;403 与 admin 控制台各为独立 Server Component 便于复用 / 测试。零新依赖,沿用现有 `@supabase/ssr` + Vitest + Playwright。

**Tech Stack:** TypeScript 5.x · Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · `@supabase/supabase-js` + `@supabase/ssr` · Vitest · @testing-library/react · Playwright(已装)· pnpm

**参考规范:** `docs/superpowers/specs/2026-06-20-block1-admin-role-design.md`

---

## 全局前置

- [ ] 仓库在 `/Users/samhooxee/dev/web/block1_user`,分支 `main`,已是干净工作区
- [ ] `node -v` ≥ 20.18,`pnpm -v` ≥ 9
- [ ] 已 `pnpm install` 完毕
- [ ] `.env.local` 含有有效的 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> **Git 提醒:** 上一轮的所有任务都已提交。本计划每个 Task 末尾独立提交,粒度细,便于回滚 / code review。

---

## Task 1: TDD — `isAdmin` 纯函数

**Files:**
- Create: `src/lib/auth/roles.test.ts`
- Create: `src/lib/auth/roles.ts`

- [ ] **Step 1: 写失败的单元测试**

`src/lib/auth/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { isAdmin } from './roles'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'u@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  } as User
}

describe('isAdmin', () => {
  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false)
  })

  it('returns false when app_metadata is undefined', () => {
    const user = { id: 'u1', app_metadata: undefined } as unknown as User
    expect(isAdmin(user)).toBe(false)
  })

  it('returns false when app_metadata has no role', () => {
    expect(isAdmin(makeUser({ app_metadata: {} }))).toBe(false)
  })

  it('returns false when role is not "admin"', () => {
    expect(isAdmin(makeUser({ app_metadata: { role: 'user' } }))).toBe(false)
  })

  it('returns true when role is "admin"', () => {
    expect(isAdmin(makeUser({ app_metadata: { role: 'admin' } }))).toBe(true)
  })

  it('returns true when app_metadata has other fields alongside admin role', () => {
    expect(
      isAdmin(makeUser({ app_metadata: { role: 'admin', foo: 'bar' } })),
    ).toBe(true)
  })

  it('returns false when only user_metadata has admin role (security-critical)', () => {
    expect(isAdmin(makeUser({ user_metadata: { role: 'admin' } }))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
pnpm test src/lib/auth/roles.test.ts
```

预期:`FAIL` — `Cannot find module './roles'` 或 `isAdmin is not a function`。

- [ ] **Step 3: 实现 `isAdmin`**

`src/lib/auth/roles.ts`:

```ts
import type { User } from '@supabase/supabase-js'

export function isAdmin(user: User | null): boolean {
  return user?.app_metadata?.role === 'admin'
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/lib/auth/roles.test.ts
```

预期:7/7 通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts
git commit -m "feat(auth): add isAdmin helper with full test coverage"
```

---

## Task 2: `<Forbidden />` 组件

**Files:**
- Create: `src/components/auth/forbidden.tsx`

- [ ] **Step 1: 创建组件**

`src/components/auth/forbidden.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Forbidden() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          403 - 无权限 / Forbidden
        </h1>
        <p className="text-gray-600 mb-6">
          此页面仅限管理员访问 / This page is restricted to administrators.
        </p>
        <Button asChild>
          <Link href="/dashboard">返回 / Back</Link>
        </Button>
      </div>
    </main>
  )
}
```

> 关键点:`<Button asChild>` 使用项目已装的 Radix `Slot.Root`(见 `src/components/ui/button.tsx:41-62`),让 `<Link>` 继承 Button 样式,无需额外配置。

- [ ] **Step 2: 类型检查**

```bash
pnpm typecheck
```

预期:`tsc --noEmit` 退出码 0。

- [ ] **Step 3: 提交**

```bash
git add src/components/auth/forbidden.tsx
git commit -m "feat(auth): add Forbidden component for non-admin 403 render"
```

---

## Task 3: `<AdminConsole />` 占位组件

**Files:**
- Create: `src/components/admin/admin-console.tsx`

- [ ] **Step 1: 创建组件**

`src/components/admin/admin-console.tsx`:

```tsx
type Props = { email: string }

export function AdminConsole({ email }: Props) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-6">
        <span className="font-semibold text-gray-900">Block1 · Admin</span>
        <span className="text-sm text-gray-600">{email}</span>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Admin 控制台 / Admin Console
          </h1>
          <p className="text-gray-600">欢迎管理员 {email}</p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm typecheck
```

预期:退出码 0。

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/admin-console.tsx
git commit -m "feat(admin): add AdminConsole placeholder component"
```

---

## Task 4: TDD — `/admin` 页面 + 鉴权分支

**Files:**
- Create: `src/app/admin/page.test.tsx`
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: 写失败的渲染测试**

`src/app/admin/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// mocks 必须在 import 之前
// redirect 必须 throw,模拟 Next.js 真实行为(NEXT_REDIRECT);
// 否则 mock 成 no-op 会让函数继续 fall through,渲染 Forbidden,断言失败
const { mockGetUser, mockRedirect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import AdminPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminPage', () => {
  it('redirects to / when user is null', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    await expect(AdminPage()).rejects.toThrow('REDIRECT:/')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('renders Forbidden for logged-in non-admin user', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'u1',
          email: 'u@x.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    })
    const element = await AdminPage()
    render(element)
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByText(/403 - 无权限/)).toBeInTheDocument()
    expect(screen.queryByText(/Admin 控制台/)).not.toBeInTheDocument()
  })

  it('renders AdminConsole for admin user with email passed through', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'u1',
          email: 'admin@x.com',
          app_metadata: { role: 'admin' },
          user_metadata: {},
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    })
    const element = await AdminPage()
    render(element)
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByText('Admin 控制台 / Admin Console')).toBeInTheDocument()
    expect(screen.getAllByText('admin@x.com').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
pnpm test src/app/admin/page.test.tsx
```

预期:`FAIL` — `Cannot find module './page'`。

- [ ] **Step 3: 实现 `/admin` 页面**

`src/app/admin/page.tsx`:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
import { Forbidden } from '@/components/auth/forbidden'
import { AdminConsole } from '@/components/admin/admin-console'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  if (!isAdmin(user)) return <Forbidden />

  return <AdminConsole email={user.email ?? ''} />
}
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
pnpm test src/app/admin/page.test.tsx
```

预期:3/3 通过。

- [ ] **Step 5: 提交**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx
git commit -m "feat(admin): add /admin page with isAdmin auth gate"
```

---

## Task 5: E2E 测试 + README 补充

**Files:**
- Create: `e2e/admin.spec.ts`
- Modify: `README.md`(新增"赋予 admin 角色"章节)

> **范围说明:** 本任务只创建 E2E 规格文件 + 文档。运行 E2E 需要 Playwright 配置(`playwright.config.ts`)+ 本地 Supabase 实例,这两项是项目原计划(`2026-06-20-block1-auth.md` Task 9+)的职责,本轮不重复。当 E2E 基础设施就位后,执行 `pnpm dlx playwright install` + `pnpm dlx supabase start` + 按 README 步骤手工赋 admin 后即可运行。

- [ ] **Step 1: 创建 E2E 规格文件**

`e2e/admin.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/**
 * 手工前置:
 * 1. 注册一个 admin 账号(走 / 的 sign-up 流程),例如 admin-e2e@block1-test.com
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
```

- [ ] **Step 2: 在 README 末尾追加"赋予 admin 角色"章节**

读取并修改 `README.md`,在"## 文档"章节之前插入新章节:

```markdown
## 赋予 admin 角色

admin 角色通过 Supabase 服务端字段 `app_metadata.role` 控制。步骤:

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 进入项目 → **Authentication** → **Users**
3. 找到目标用户,点击进入详情
4. 滚动到 **Raw App Meta Data**,填入:
   ```json
   {"role": "admin"}
   ```
5. 保存

> 修改后,**当前会话的 JWT 仍是旧版本**,需要让该用户**退出再登录**才能拿到新角色。详见 `docs/superpowers/specs/2026-06-20-block1-admin-role-design.md` §6.4。

### E2E 测试用 admin 账号

E2E(`e2e/admin.spec.ts`)需要一个预置 admin 账号。手工预置步骤同上,推荐邮箱:`admin-e2e@block1-test.com`。

```

- [ ] **Step 3: 提交**

```bash
git add e2e/admin.spec.ts README.md
git commit -m "test(e2e): add admin auth spec and document manual admin grant"
```

---

## Task 6: 质量门 + 手工冒烟

**Files:**
- 不改代码(仅验证)

- [ ] **Step 1: 跑全量质量检查**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

预期:全部退出码 0。

- [ ] **Step 2: 跑覆盖率,确认 ≥ 80%**

```bash
pnpm test:cov
```

打开 `coverage/index.html`,确认 `src/lib/auth/roles.ts` 与 `src/app/admin/page.tsx` 覆盖率均为 100%(组件 / 页面以行覆盖率为准,内部 if 分支都被覆盖)。

- [ ] **Step 3: 手工三场景冒烟**

```bash
pnpm dev
```

按顺序验证(每步前用浏览器无痕模式 / 退出登录):

1. **场景 A — 未登录访问 /admin**:访问 `http://localhost:3000/admin`,应自动跳到 `/`。
2. **场景 B — 非 admin 访问 /admin**:用普通注册账号登录,访问 `/admin`,URL 保持 `/admin`,看到 "403 - 无权限 / Forbidden" + "返回 / Back" 按钮;点击 "返回" 跳到 `/dashboard`。
3. **场景 C — admin 访问 /admin**:按 README "赋予 admin 角色" 步骤给当前账号赋 admin,**退出再登录**;访问 `/admin`,看到 "Admin 控制台 / Admin Console" + 顶部右侧显示自己的邮箱。

- [ ] **Step 4: (无变更则跳过)若发现问题,修复后提交**

```bash
# 例:
git add -A
git commit -m "fix: <description>"
```

---

## 任务完成自检清单

跑完所有 Task 后,确认:

- [ ] 6 个 Task 全部 check,代码已提交
- [ ] `pnpm test` 通过,覆盖率 ≥ 80%
- [ ] `pnpm typecheck && pnpm lint` 通过
- [ ] 手工三场景冒烟全部通过
- [ ] README 中 "赋予 admin 角色" 章节完整

---

## 风险与回滚

- **R1 — E2E 跑不起来**:本计划只交付 E2E 规格文件 + 文档。若 `pnpm test:e2e` 失败,通常原因是 Playwright 浏览器未装 / Supabase 未起 / admin 账号未手工赋权。**不阻塞** 本轮合并,只阻塞"运行 E2E 验证"这一步。
- **R2 — admin 角色修改不立即生效**:已在 README + spec 明确"退出再登录"。若用户报"改了 role 还是 403",先确认是否重新登录。
- **R3 — 类型问题**:`User.app_metadata` 在 `@supabase/supabase-js` 2.108.x 中类型为 `Record<string, any>`,用 `?.` 链式访问安全。若 `pnpm typecheck` 报缺类型,优先 cast 为 `unknown as User`(测试文件里已示范),不要 `// @ts-ignore`。
- **回滚**:`git revert HEAD~6..HEAD` 可一次性回滚本计划全部 6 个 commit(假设 6 个 commit 都是本计划的提交)。

## 后续(本计划不做)

- E2E 基础设施(playwright.config.ts、global setup、登录态注入)
- 自动化 admin 提权(`SUPABASE_SERVICE_ROLE_KEY` + 管理面板)
- 细粒度角色(editor / viewer)
- admin 角色变更后主动失效旧 token
