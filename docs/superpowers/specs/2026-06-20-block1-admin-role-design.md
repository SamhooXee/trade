# Block1 Admin 角色 — 设计规范

**日期**: 2026-06-20
**状态**: 已设计,待用户复核
**前置依赖**: `2026-06-20-block1-auth-design.md`(登录 / 注册已实现)
**范围**: 为现有用户体系加上 admin 角色,新增 `/admin` 受保护占位页与非 admin 403 渲染

---

## 1. 目标

为已有登录体系增加 admin 角色访问控制:

- `app_metadata.role === 'admin'` 的用户可访问 `/admin`
- 非 admin 已登录用户访问 `/admin` 时,原 URL 渲染 403 页面(保留 URL)
- 未登录用户访问 `/admin` 仍走现有 `redirect('/')` 行为(与 `/dashboard` 一致)
- 鉴权逻辑在 Server Component 页面内完成,`isAdmin` 抽为可单测的纯函数

成功标准:
- 在 Supabase Dashboard 给某用户 `app_metadata` 写入 `{ "role": "admin" }`,该用户重新登录后访问 `/admin` 看到 "Admin 控制台 / Admin Console"
- 任意其他已登录用户访问 `/admin` 看到 "403 - 无权限 / Forbidden" + 返回按钮
- 未登录用户访问 `/admin` 被重定向到 `/`
- `isAdmin()` 单元测试覆盖 null / 缺字段 / 非 admin role / admin role / `user_metadata` 误用 等场景

## 2. 范围之外(YAGNI)

本轮**不**做:

- 第三方 OAuth(Google / GitHub)登录 — `User.email` 兜底逻辑在 `AdminConsole` 透传,仅当 null 时降级为 `''`
- 应用内 admin 提权 UI(通过 Dashboard / SQL 手工改)
- 角色粒度更细(只引入 `admin`,不引入 `editor` / `viewer` / 自定义权限系统)
- RLS 策略(MVP 阶段无业务表,RLS 暂不启用)
- 用户列表 / 审计日志 / 管理面板功能
- `app_metadata` 修改后立即生效的 token 主动失效机制(沿用 Supabase 现有 token 生命周期)
- E2E 自动化 admin 赋权(本轮 E2E 依赖手工赋权)
- 引入 `SUPABASE_SERVICE_ROLE_KEY` 到应用代码(后续若需自动化 admin 操作再单独评估)

## 3. 技术选型

沿用 `2026-06-20-block1-auth-design.md` 全部技术栈,**不**引入新依赖。

| 类别 | 选型 |
|---|---|
| Admin 角色存储 | Supabase `auth.users.app_metadata.role` |
| 角色读取 | 服务端 `supabase.auth.getUser().then(user => user.app_metadata.role)` |
| 鉴权位置 | Server Component 页面内(`src/app/admin/page.tsx`) |
| 鉴权抽象 | `src/lib/auth/roles.ts` 暴露 `isAdmin(user: User \| null): boolean` |
| 403 渲染 | 内联组件 `<Forbidden />`,与其他受保护页可复用 |
| Admin 页内容 | 占位组件 `<AdminConsole email={...} />` |

## 4. 目录结构(新增文件)

```
src/
├── app/
│   ├── admin/
│   │   ├── page.tsx               # Server Component,鉴权 + 分支渲染
│   │   └── page.test.tsx          # 渲染测试(mock supabase server)
│   └── (现有)
├── components/
│   ├── admin/
│   │   └── admin-console.tsx      # 占位页:标题 + 欢迎邮箱
│   ├── auth/
│   │   ├── forbidden.tsx          # 403 组件(可复用)
│   │   └── (现有)
│   └── ui/                       # 沿用
└── lib/
    ├── auth/
    │   ├── roles.ts              # isAdmin(user): boolean
    │   ├── roles.test.ts         # 单元测试
    │   └── (现有 map-error.ts)
    └── (现有)

e2e/
└── admin.spec.ts                 # 非 admin 路径 + admin 路径 + 未登录重定向

docs/superpowers/specs/
└── 2026-06-20-block1-admin-role-design.md  # 本文件
```

**文件大小控制**(遵循项目 coding style):
- `roles.ts` < 20 行(纯函数,无分支逻辑)
- `forbidden.tsx` < 50 行(纯展示)
- `admin-console.tsx` < 50 行(纯展示)
- `admin/page.tsx` < 30 行(纯串接)

## 5. 视觉设计

沿用现有项目视觉系统(白卡 + 渐变背景 + Indigo 强调色)。无新色板,无新字体。

**403 页面 (`<Forbidden />`)**:
- 容器:`bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 max-w-sm w-full text-center`
- 标题:`text-2xl font-semibold text-gray-900`,文案 `403 - 无权限 / Forbidden`
- 副标题:`text-gray-600`,文案 `此页面仅限管理员访问 / This page is restricted to administrators.`
- CTA 按钮:`<Button asChild><Link href="/dashboard">返回 / Back</Link></Button>`,variant 沿用 `default`

**Admin 占位页 (`<AdminConsole />`)**:
- 整体布局参考 `/dashboard`,改为 `Block1 · Admin` 品牌
- 顶部条:`flex justify-between items-center p-6`,左侧 `Block1 · Admin`,右侧 email
- 主体:`flex-1 flex items-center justify-center px-4`,居中:
  - `h1 text-3xl font-semibold text-gray-900 mb-2`,文案 `Admin 控制台 / Admin Console`
  - `p text-gray-600`,文案 `欢迎管理员 {email}`

## 6. 数据流

### 6.1 鉴权链(三场景统一)

```
GET /admin
  └─ middleware.ts: updateSession()
     └─ 刷新 / 解析 JWT Cookie(不鉴权,只让下游能 getUser)
        └─ src/app/admin/page.tsx (Server Component)
           ├─ const supabase = await createClient()
           ├─ const { data: { user } } = await supabase.auth.getUser()
           ├─ if (!user) redirect('/')              ← 场景 A:未登录
           ├─ if (!isAdmin(user)) return <Forbidden />  ← 场景 B:非 admin
           └─ return <AdminConsole email={user.email ?? ''} />  ← 场景 C:admin
```

### 6.2 `isAdmin` 实现

```ts
import type { User } from '@supabase/supabase-js'

export function isAdmin(user: User | null): boolean {
  return user?.app_metadata?.role === 'admin'
}
```

- **只读** `app_metadata`,不读 `user_metadata`(后者客户端可写,不可信)
- 接受 `null` 输入,直接返回 `false`,省去调用方额外判空
- 纯函数,无副作用,可独立单测

### 6.3 JWT 与 `app_metadata` 信任链

1. 登录成功后,Supabase 在 HTTP-only + Secure + SameSite=Lax Cookie 中存 access token(JWT 签名)。
2. middleware `updateSession` → `getUser()` 在服务端用 Supabase JWKS 验签;失败返回 `null`,**不会**让伪造的 user 对象渗透。
3. `user.app_metadata` 是 Supabase 服务端写入的字段,客户端 **只读**。即便前端 JS 拿到 user 对象,改写也无效(改写会触发 Supabase 客户端写入 `user_metadata` 而非 `app_metadata`)。
4. 因此,Server Component 读到的 `user.app_metadata.role` 等同于"Supabase 服务端认可的事实",可作为授权依据。

### 6.4 admin 角色变更生效时机

- Dashboard / SQL 修改 `app_metadata` 后,**当前 access token 仍是旧版本**(Supabase access token 默认 1 小时过期)。
- 用户生效路径:① 退出再登录(立即生效) ② 等待 token 过期 + 中间件自动刷新(最长 1 小时)。
- 这是 Supabase 安全模型的固有行为,本设计**不**做主动 token 失效(无业务需求,复杂度不值)。

### 6.5 错误 / 边界处理

- `getUser()` 网络异常 → Supabase 客户端返回 `null` → 走场景 A `redirect('/')`,不暴露错误给用户。
- `user.email === null`(OAuth 场景) → `AdminConsole` 收到 `''`,展示 `欢迎管理员 `(空)。本轮无 OAuth,属防御性兜底。
- JWT 过期 → middleware 尝试用 refresh token 续期;若 refresh 也失败,session 失效,`getUser()` 返回 `null`,走场景 A。

## 7. Server / Client 边界

- 所有新增组件(Server / Client)默认 Server Component,无 `useState` / `useEffect`,不需 `'use client'`。
- `<Button asChild>` 走 Radix `Slot.Root`,接受 `<Link>` 作为子节点并继承 Button 样式(Button 源码已确认支持)。
- 不引入新的 Client Component,不改 `middleware.ts`。

## 8. 测试策略

### 8.1 单元测试 — `src/lib/auth/roles.test.ts`

| 用例 | 输入 | 期望 |
|---|---|---|
| `null` user | `null` | `false` |
| user 无 `app_metadata` | `{} as User` | `false` |
| `app_metadata` 无 `role` | `{ app_metadata: {} } as User` | `false` |
| `role` 不是 `'admin'` | `{ app_metadata: { role: 'user' } } as User` | `false` |
| `role === 'admin'` | `{ app_metadata: { role: 'admin' } } as User` | `true` |
| `app_metadata` 含其他字段 + role admin | `{ app_metadata: { role: 'admin', foo: 1 } } as User` | `true` |
| **`user_metadata` 含 admin(安全关键)** | `{ user_metadata: { role: 'admin' } } as User` | `false` |

最后一条明确"**只**信任 `app_metadata`"。

### 8.2 渲染测试 — `src/app/admin/page.test.tsx`

mock `@/lib/supabase/server` 返回可控 `{ auth: { getUser: vi.fn() } }`,mock `next/navigation` 的 `redirect` 为 `vi.fn()`(断言调用而不真跳)。

| 用例 | mock `getUser` 返回 | 断言 |
|---|---|---|
| 未登录 | `{ data: { user: null }, error: null }` | `redirect('/')` 被调用一次;Forbidden / AdminConsole 均不渲染 |
| 已登录非 admin | `{ data: { user: { id: '1', email: 'u@x.com', app_metadata: {} } } }` | `redirect` 未调用;渲染 `403`;断言不出现 "Admin Console" |
| admin | `{ data: { user: { id: '1', email: 'admin@x.com', app_metadata: { role: 'admin' } } } }` | 渲染 "Admin 控制台";email `admin@x.com` 出现在文档 |

### 8.3 E2E — `e2e/admin.spec.ts`(新增)

依赖**手工预置** admin 账号:

- 用 `admin-e2e@block1-test.com` 注册(走正常 sign-up 流程)
- 手工到 Supabase Dashboard → Authentication → Users → 该用户 → Raw App Meta Data,写入 `{"role": "admin"}`
- 退出再登录,新 JWT 含 admin 角色

| 用例 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| 未登录访问 `/admin` | 无 | 访问 `/admin` | URL 变为 `/` |
| 非 admin 访问 `/admin` | 普通账号登录态 | 访问 `/admin` | URL 保持 `/admin`,看到 "403 - 无权限" |
| admin 访问 `/admin` | `admin-e2e@...` 登录态 | 访问 `/admin` | 看到 "Admin 控制台" + 自己的邮箱 |

> 注:不自动化 admin 赋权的原因 = 避免在本轮引入 `SUPABASE_SERVICE_ROLE_KEY` 到 E2E 配置。后续若要自动化,需独立评估密钥管理与 CI 注入路径。

### 8.4 质量门

- `pnpm typecheck` 通过
- `pnpm lint` 通过
- `pnpm test`(单元 + 集成)通过
- 覆盖率 ≥ 80%(沿用项目基线)
- 至少 1 个 E2E 用例覆盖非 admin 路径

## 9. 实施顺序(给 writing-plans 阶段)

1. `src/lib/auth/roles.ts` + `roles.test.ts`(**TDD:先写测试,再写实现**)
2. `src/components/auth/forbidden.tsx`(无依赖)
3. `src/components/admin/admin-console.tsx`(无依赖)
4. `src/app/admin/page.tsx`(串起来)
5. `src/app/admin/page.test.tsx`
6. `e2e/admin.spec.ts` + 更新 README 记录"如何手工赋 E2E admin"
7. `pnpm typecheck && pnpm lint && pnpm test` 全过
8. 手工三场景验证 + 截图归档

## 10. 风险与注意事项

- **R1 — E2E 手工赋权易漏**:在 README 中写清"Dashboard → Users → admin-e2e@... → Raw App Meta Data"步骤,并在 e2e 文件顶部注释强调。长期方案:`SERVICE_ROLE_KEY` + 提权脚本(本轮**不做**)。
- **R2 — 角色变更不立即生效**:文档 + spec 明确"修改后需重新登录";若用户报"刚改了 role 但还是 403",指引其退出再登。
- **R3 — `User.app_metadata` 类型在 `@supabase/supabase-js` 中可能为 `undefined`**:实测用 `?.`,TS 严格模式允许;若运行时报类型错误,改 `user.app_metadata?.role`(已用 `?.`,无问题)。
- **R4 — `<Button asChild>` 与 `<Link>` 嵌套**:Radix `Slot.Root` 要求 asChild 的子元素**只能有一个** React 元素。本设计 `<Button asChild><Link>...</Link></Button>` 满足。
- **R5 — 现有 `/dashboard` 不动**:本轮不修改 dashboard 鉴权链,避免回归风险。

## 11. 后续扩展(本轮不做)

- 增加 RLS 策略(若有业务表接入)
- 引入更细粒度角色(editor / viewer)
- 自动化 admin 提权(服务角色 key + 管理面板)
- 角色变更主动失效旧 token
- `/admin/users` 用户管理子页
- 审计日志

## 12. 变更日志

- 2026-06-20:初稿,经 brainstorming 7 问澄清 + 4 节设计评审,用户已确认。
