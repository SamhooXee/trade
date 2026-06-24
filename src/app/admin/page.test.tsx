import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// mocks 必须在 import 之前
// redirect 必须 throw,模拟 Next.js 真实行为(NEXT_REDIRECT);
// 否则 mock 成 no-op 会让函数继续 fall through,渲染 Forbidden,断言失败
const { mockGetUser, mockRedirect, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  mockFrom: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { LanguageProvider } from '@/components/providers/language-provider'
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
    render(
      <LanguageProvider initialLang="zh">
        {element}
      </LanguageProvider>
    )
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
    render(
      <LanguageProvider initialLang="zh">
        {element}
      </LanguageProvider>
    )
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByText(/激活码管理|activation keys/i)).toBeInTheDocument()
    expect(screen.getAllByText('admin@x.com').length).toBeGreaterThan(0)
  })
})

