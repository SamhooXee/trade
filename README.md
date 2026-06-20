# Block1

Next.js 15 + Supabase 全栈应用骨架,当前实现登录 / 注册 / 受保护欢迎页的 MVP。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (`@supabase/ssr`) + react-hook-form + zod
- Vitest + Playwright

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local,填入 Supabase URL 和 anon key

# 3. 启动开发服务器
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key |

> `NEXT_PUBLIC_` 前缀意味着会暴露到浏览器,这是 Supabase 官方设计,安全由 RLS 保证(本 MVP 暂未启用)。

## 本地 Supabase(可选,用于 E2E)

```bash
pnpm dlx supabase start
```

输出中包含 `API URL` 和 `anon key`,填入 `.env.local` 即可。

## 脚本

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 启动 dev server |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产 server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm test` | 单元 + 集成测试 |
| `pnpm test:cov` | 覆盖率 |
| `pnpm test:e2e` | Playwright E2E |

## 目录结构

```
src/
  app/                # App Router 页面 + Server Actions
  components/auth/    # AuthCard / SignInForm / SignUpForm
  components/ui/      # shadcn 原子组件
  lib/
    auth/             # mapAuthError
    schemas/          # zod schemas
    supabase/         # server / client / middleware 客户端
middleware.ts        # Next.js middleware
e2e/                 # Playwright
```

## 文档

- 设计规范:`docs/superpowers/specs/2026-06-20-block1-auth-design.md`
- 实施计划:`docs/superpowers/plans/2026-06-20-block1-auth.md`
