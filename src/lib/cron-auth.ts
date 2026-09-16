import { NextResponse } from 'next/server'

/**
 * Vercel Cron 鉴权:检查 Authorization: Bearer ${CRON_SECRET}。
 * 返回 null 表示通过;返回 NextResponse 表示 401 拒绝。
 */
export function checkCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}