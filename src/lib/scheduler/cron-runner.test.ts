import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withCronGuard } from './cron-runner'

describe('withCronGuard', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'correct-secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const handler = vi.fn()
    const req = new Request('http://localhost/test')
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when Bearer token mismatches', async () => {
    const handler = vi.fn()
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler when Bearer token matches and returns its response', async () => {
    const handler = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('returns 500 + logs error when handler throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn(async () => {
      throw new Error('boom')
    })
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    const res = await withCronGuard(req, handler, { name: 'test-cron' })
    expect(res.status).toBe(500)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-cron'),
      expect.any(Error),
    )
  })

  it('supports custom logger (e.g. record to DB)', async () => {
    const logger = vi.fn()
    const handler = vi.fn(async () => {
      throw new Error('boom')
    })
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer correct-secret' },
    })
    await withCronGuard(req, handler, { name: 'test-cron', onError: logger })
    expect(logger).toHaveBeenCalledWith(expect.any(Error))
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const handler = vi.fn()
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer anything' },
    })
    const res = await withCronGuard(req, handler)
    expect(res.status).toBe(500)
    expect(handler).not.toHaveBeenCalled()
  })
})