# Block1 登录/注册 — 设计规范

**日期**: 2026-06-20
**状态**: 已设计,待用户复核
**范围**: MVP 阶段,仅含登录/注册功能

---

## 1. 目标

搭建一个 Next.js + Supabase 全栈应用的骨架,当前阶段实现一个最小可用的用户认证闭环(登录、注册、退出、会话保持)。后续业务功能将在此基础上添加。

成功标准:
- 用户在未登录状态下访问首页 `/`,看到登录/注册卡片
- 注册新账号无需邮箱验证,提交后自动登录并跳转到 `/dashboard`
- 已注册用户可从 `/` 登录,成功后跳转到 `/dashboard`
- 未登录用户访问 `/dashboard` 会被重定向回 `/`
- 已登录用户访问 `/` 会被重定向到 `/dashboard`
- 用户可从 `/dashboard` 退出,回到 `/`
- 错误凭证在卡片中以中英双语提示

## 2. 范围之外(YAGNI)

以下显式**不在**本次实施范围内:
- 忘记密码 / 重置密码流程
- 邮箱验证(Supabase 后台关闭 Confirm email)
- 第三方登录(Google / GitHub / OAuth)
- 业务数据表(如 `profiles`)、RLS 策略
- 国际化框架(仅文案层面中英双语)
- 用户个人资料、头像、昵称
- 监控/分析(Sentry / PostHog)
- 邮件模板定制
- 速率限制自定义(使用 Supabase 内置)

## 3. 技术栈

| 类别 | 选型 |
|---|---|
| 包管理 | pnpm |
| 框架 | Next.js 15(App Router)+ React 19 |
| 语言 | TypeScript(`strict: true`) |
| 样式 | Tailwind CSS 4 |
| UI 组件 | shadcn/ui(Tabs / Card / Button / Input / Label / Alert)+ lucide-react(图标) |
| 表单 | react-hook-form + @hookform/resolvers + zod |
| 后端 / 认证 | Supabase(`@supabase/supabase-js` + `@supabase/ssr`)|
| 单元 / 集成测试 | Vitest |
| E2E 测试 | Playwright |
| 本地 Supabase | supabase CLI(Docker) |

## 4. 目录结构

```
block1_user/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # 根布局,字体,基础样式
│   │   ├── page.tsx                  # 公开页:产品名 + <AuthCard />
│   │   ├── dashboard/
│   │   │   └── page.tsx              # 受保护:服务端鉴权 + 简单欢迎
│   │   └── actions/
│   │       └── auth.ts               # signIn / signUp / signOut Server Actions
│   ├── components/
│   │   ├── auth/
│   │   │   ├── auth-card.tsx         # 客户端:Tab 容器(登录/注册)
│   │   │   ├── sign-in-form.tsx      # 客户端:RHF + zod
│   │   │   └── sign-up-form.tsx      # 客户端:RHF + zod
│   │   └── ui/                       # shadcn 原子组件
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── alert.tsx
│   │       └── tabs.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts             # createServerClient (Cookie)
│   │   │   ├── client.ts             # createBrowserClient
│   │   │   └── middleware.ts         # updateSession 辅助
│   │   ├── auth/
│   │   │   └── map-error.ts          # Supabase error.code → 中英双语文案
│   │   ├── schemas/
│   │   │   └── auth.ts               # zod: signInSchema, signUpSchema
│   │   └── utils.ts                  # shadcn 默认 cn() 等
├── middleware.ts                     # 根 middleware:每次请求刷新 Session
├── .env.local                        # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
├── .env.example                      # 模板,提交进仓库
├── components.json                   # shadcn 配置
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
├── package.json
└── pnpm-lock.yaml
```

## 5. 视觉设计

**整体风格**:柔和阴影 + 蓝紫(Indigo)强调色,白卡 + 浅紫→浅粉渐变背景。Vercel / Stripe / Linear 风格。

**背景**:`bg-gradient-to-br from-indigo-50 to-fuchsia-50`,所有页面统一。

**AuthCard**:
- 容器:`bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 border-0`
- 宽度:`w-full max-w-sm`
- Tabs 列表:`grid grid-cols-2 bg-transparent border-b`
- Tab active:`text-indigo-600 border-b-2 border-indigo-600 -mb-px`
- Tab inactive:`text-gray-500`
- Tab 文本格式:`登录 / Sign in`、`注册 / Sign up`

**Input**:
- `h-11 rounded-lg border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200`
- 错误态:`border-red-500 focus:border-red-500 focus:ring-red-200`

**Submit Button**:
- `h-11 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-200`
- pending 态:禁用 + 文案"登录中… / Signing in…"或"注册中… / Signing up…"

**Alert(服务端错误)**:
- shadcn `Alert variant="destructive"`,含 `AlertCircle` 图标
- 置于表单顶部、提交按钮上方

**首页 `/`**:
- `min-h-screen flex flex-col items-center justify-center` + 渐变背景
- 顶部:`<h1 className="text-3xl font-semibold mb-8 text-gray-900">Block1</h1>`
- 下方:居中 `<AuthCard />`

**`/dashboard`**:
- `min-h-screen flex flex-col` + 渐变背景
- 顶部条:`flex justify-between items-center p-6`,左侧"Block1",右侧用户邮箱 + 退出按钮
- 主体:`flex-1 flex items-center justify-center`,居中文案"欢迎回来 / Welcome back 👋"

## 6. 数据流

### 6.1 首次访问 `/`(未登录)

1. `middleware.ts` 调用 `updateSession` —— 没有 Cookie,no-op
2. `/` 是 Server Component,渲染 `<AuthCard />`(client component)
3. 用户看到登录/注册卡片

### 6.2 首次访问 `/`(已登录)

1. middleware 通过 Cookie 拿到 Session,`getUser()` 校验 JWT
2. `/` 检测到 `user` 存在,直接 `redirect('/dashboard')`

### 6.3 注册

```
SignUpForm (client)
  └─ zod 校验 (client side)
     └─ 调 signUpAction (Server Action)
        └─ zod 校验 (server side, defense in depth)
           └─ supabase.auth.signUp({ email, password })
              ├─ 成功: Supabase 写 HTTP-only Cookie → redirect('/dashboard')
              └─ 失败: return { error: mapAuthError(error) }
```

### 6.4 登录

```
SignInForm (client)
  └─ zod 校验
     └─ 调 signInAction
        └─ supabase.auth.signInWithPassword({ email, password })
           ├─ 成功: Supabase 写 Cookie → redirect('/dashboard')
           └─ 失败: return { error: '邮箱或密码错误 / ...' }
```

### 6.5 退出登录

```
/dashboard [退出登录] 按钮(包在 <form action={signOutAction}>)
  └─ signOutAction
     └─ supabase.auth.signOut()  (清 Cookie)
        └─ redirect('/')
```

### 6.6 访问 `/dashboard` 鉴权链

1. `middleware.ts` 先跑,`updateSession` 自动续期过期 Cookie(只刷新、不拦截)
2. `/dashboard/page.tsx`(Server Component):
   ```ts
   const supabase = createServerClient(...)
   const { data: { user } } = await supabase.auth.getUser()
   if (!user) redirect('/')
   ```
3. 通过 → 渲染欢迎页(用户邮箱 + 退出按钮)

### 6.7 Session 存储

Supabase 在 HTTP-only + Secure + SameSite=Lax Cookie 里存 access/refresh token。JavaScript 不可读,XSS 安全。

## 7. Server Actions

文件:`src/app/actions/auth.ts`

```ts
'use server'

type FormState = {
  error?: string
  fieldErrors?: {
    email?: string[]
    password?: string[]
    confirmPassword?: string[]
  }
} | null

export async function signInAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState>

export async function signUpAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState>

export async function signOutAction(_formData: FormData): Promise<void>
```

**通用流程**:
1. `Object.fromEntries(formData)` → zod `safeParse`
2. 校验失败 → 返回 `{ fieldErrors: parsed.error.flatten().fieldErrors }`
3. 校验通过 → 调 Supabase auth 方法
4. 失败 → 返回 `{ error: mapAuthError(error) }`
5. 成功 → `redirect('/dashboard')`(throws,不再 return)

`signOutAction` 流程较简:`signOut()` + `redirect('/')`。

## 8. zod 校验规则

**`signInSchema`**(`src/lib/schemas/auth.ts`):
```ts
{
  email: z.string().email('邮箱格式不正确 / Invalid email'),
  password: z.string().min(6, '密码至少 6 位 / Password must be at least 6 chars'),
}
```

**`signUpSchema`**:
```ts
{
  email: z.string().email('邮箱格式不正确 / Invalid email'),
  password: z.string()
    .min(8, '密码至少 8 位 / Password must be at least 8 chars')
    .regex(/\d/, '密码需包含数字 / Password must include a number'),
  confirmPassword: z.string(),
}.refine(d => d.password === d.confirmPassword, {
  message: '两次密码不一致 / Passwords do not match',
  path: ['confirmPassword'],
})
```

## 9. 错误码映射

文件:`src/lib/auth/map-error.ts`

| Supabase error.code | 展示文案 |
|---|---|
| `invalid_credentials` | 邮箱或密码错误 / Invalid email or password |
| `user_already_exists` / `email_exists` | 该邮箱已注册 / Email already registered |
| `weak_password` | 密码至少 8 位且包含数字 / Password must be 8+ chars and include a number |
| `email_address_invalid` | 邮箱格式不正确 / Invalid email format |
| `over_email_send_rate_limit` | 请求过于频繁,请稍后再试 / Too many requests, please try again |
| `signup_disabled` | 注册已关闭 / Sign-up is disabled |
| 其他 / 网络错误 | 出了点问题,请重试 / Something went wrong, please try again |

未列出的 error.code 走"其他"分支,日志中打印原始 code 便于排查。

## 10. Supabase 项目配置

Supabase 项目已存在(用户报告),需在 Dashboard 中:

1. **Authentication → Providers → Email**:`Confirm email` 关闭
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: 加入 `http://localhost:3000/**`
3. **Project Settings → API**:复制 `Project URL` 和 `anon public` key

将上述两个值写入项目根目录 `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
```

> 不需要建表(MVP 阶段 `auth.users` 够用)。无需生成 `src/types/database.ts`(无业务表)。

## 11. package.json scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:cov": "vitest run --coverage",
    "supabase:types": "supabase gen types typescript --local > src/types/database.ts",
    "format": "prettier --write ."
  }
}
```

## 12. .gitignore 关键行

```
node_modules
.next
.env*.local
.superpowers/
coverage
playwright-report
test-results
```

## 13. middleware.ts

项目根目录:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

`updateSession` 实现位于 `src/lib/supabase/middleware.ts`,按 Supabase 官方 Next.js + `@supabase/ssr` 模板编写(createServerClient + getUser + setAll cookies)。

## 14. 测试策略

### 14.1 单元测试(Vitest,无 Next 运行环境)

| 文件 | 覆盖 |
|---|---|
| `src/lib/schemas/auth.test.ts` | signInSchema / signUpSchema 合法/非法用例 |
| `src/lib/auth/map-error.test.ts` | mapAuthError 每个 error.code 的映射 |
| `src/components/auth/sign-in-form.test.tsx` | 渲染、字段错误显示、pending 状态、服务端 error 显示 |
| `src/components/auth/sign-up-form.test.tsx` | 同上 + confirmPassword 联动 |
| `src/components/auth/auth-card.test.tsx` | 渲染两个 Tab、默认激活、切换 |

### 14.2 集成测试(Vitest + mock Supabase)

| 文件 | 覆盖 |
|---|---|
| `src/app/actions/auth.test.ts` | signInAction:zod 失败、Supabase `invalid_credentials`、成功重定向;signUpAction / signOutAction 同结构 |

Mock 方式:`vi.mock('@/lib/supabase/server', ...)` 返回可控的 `{ auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn() } }`。

`redirect` 用 `vi.mock('next/navigation', ...)` mock,断言被以正确路径调用。

### 14.3 E2E 测试(Playwright,真 Supabase)

- 本地启动:`supabase start`(Docker 起 Postgres + GoTrue)
- `.env.test.local` 指向本地 supabase URL/keys
- 测试用户隔离:每个 spec 用 `test-${Date.now()}-${random}@example.com`
- `e2e/auth.spec.ts` 用例:
  1. 访问 `/`,看到"Block1"标题 + 登录卡片
  2. 切到"注册" Tab,填邮箱 + 密码,提交,落在 `/dashboard`,看到欢迎文案
  3. 退出登录,回到 `/`
  4. 用刚注册的邮箱登录,落在 `/dashboard`
  5. 错误密码 → 看到 Alert "邮箱或密码错误 / Invalid email or password"
  6. 退出后访问 `/dashboard` → 重定向回 `/`
  7. 已登录访问 `/` → 重定向到 `/dashboard`

### 14.4 质量门

- `pnpm typecheck` 通过
- `pnpm lint` 通过
- `pnpm test`(单元 + 集成)通过
- 覆盖率 ≥ 80%

## 15. 实施顺序(给 writing-plans 阶段做参考)

1. 项目脚手架:`pnpm create next-app` + 安装依赖 + 配置 Tailwind + 配置 shadcn
2. 环境变量 + Supabase Dashboard 配置
3. Supabase 客户端三件套:`server.ts` / `client.ts` / `middleware.ts` + 根 `middleware.ts`
4. zod schemas + mapAuthError
5. Server Actions(`signIn` / `signUp` / `signOut`)
6. AuthCard + SignInForm + SignUpForm 组件
7. 页面:`/` + `/dashboard`
8. 单元 + 集成测试
9. 启动本地 Supabase + E2E 测试
10. 端到端手工验证 + 截图

## 16. 风险与注意事项

- **Cookie 处理**:`@supabase/ssr` 的 `setAll` 必须正确转发,否则 session 无法跨请求保持,新手常见踩点
- **Server Component 异步**:`createServerClient` 在 Next 15 中必须是 `async`,否则 cookies() 调用报错
- **shadcn 颜色**:`base color: indigo` 在 components.json 中显式指定,避免默认 `slate` 与设计不符
- **Playwright + 本地 Supabase**:`supabase start` 启动较慢(~10s),CI 中需要等待
- **环境变量注入**:Next 15 + Turbopack 下,`.env.local` 改动需重启 dev server

## 17. 后续扩展(本次不做)

当本 MVP 完成后,可能的下一步:
- 增加 `profiles` 表 + 触发器(注册时自动建 profile)
- 增加 RLS 策略
- 接入第三方 OAuth(Google / GitHub)
- 添加忘记密码流程
- 引入 next-intl 替换手写双语
- 增加 monitoring / error tracking
