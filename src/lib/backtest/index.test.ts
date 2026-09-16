import { describe, it, expect } from 'vitest'
import * as barrelExports from '@/lib/backtest'
import * as queryModule from '@/lib/backtest/query'

// 回归保护:防止 barrel 再次 re-export 服务端模块(@/lib/supabase/server → next/headers),
// 否则 Client Component(如 run-backtest-form.tsx)import 任何 barrel 导出都会把 next/headers 拖进客户端 bundle,
// 触发 "You're importing a module that depends on \"next/headers\"" 编译错误。
//
// 对照样板:src/lib/strategy/index.ts 已有相同注释,query 也不从 barrel 转发。
describe('@/lib/backtest barrel', () => {
  it('does not re-export server-only data-fetching helpers from ./query.ts', () => {
    const queryNames = Object.keys(queryModule).filter(
      (k) => k !== 'default' && k !== '__esModule',
    )
    for (const name of queryNames) {
      expect(
        barrelExports,
        `barrel must NOT re-export "${name}" from ./query.ts; it pulls next/headers into the client bundle. ` +
          `Server Components should import it directly from '@/lib/backtest/query' instead.`,
      ).not.toHaveProperty(name)
    }
  })

  it('does not re-export server actions', () => {
    // createBacktestRunAction 在 actions.ts 里以 'use server' 声明;经 barrel 转发会让客户端
    // bundler 误把 actions.ts 整体拉入,触发 next/headers。Client Component 必须直接
    // import from '@/lib/backtest/actions'。
    expect(barrelExports).not.toHaveProperty('createBacktestRunAction')
  })
})