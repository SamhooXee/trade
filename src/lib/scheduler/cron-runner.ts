/**
 * 通用 cron Route Handler wrapper:
 *   1. 鉴权:Authorization: Bearer ${CRON_SECRET}
 *   2. try/catch + console.error 日志
 *   3. 可选 onError 回调(写 strategy_run_log 或发告警)
 *
 * 用法:
 *
 *   import { withCronGuard } from '@/lib/scheduler/cron-runner'
 *
 *   export async function POST(req: Request) {
 *     return withCronGuard(req, async () => {
 *       // 业务逻辑
 *       return Response.json({ ok: true })
 *     }, { name: 'run-strategies' })
 *   }
 */

export interface CronGuardOptions {
  /** 日志标签(默认 'cron') */
  name?: string
  /** 自定义错误处理(默认 console.error) */
  onError?: (err: unknown) => void | Promise<void>
}

export async function withCronGuard(
  req: Request,
  handler: () => Promise<Response>,
  opts: CronGuardOptions = {},
): Promise<Response> {
  const { name = 'cron', onError } = opts
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // 启动期就应该 fail;运行时再 fail 是配置错误,显式抛
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth !== expectedHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    return await handler()
  } catch (err) {
    console.error(`[cron:${name}] failed`, err)
    if (onError) await onError(err)
    return new Response(
      JSON.stringify({ error: 'internal_error', cron: name }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}