import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockPush, mockPathname } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPathname: vi.fn(() => '/market/600000'),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}))

import { LanguageProvider } from '@/components/providers/language-provider'
import { PeriodSelector } from './period-selector'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PeriodSelector', () => {
  it('渲染 5 个 tab 触发器 (zh)', () => {
    render(
      <LanguageProvider initialLang="zh">
        <PeriodSelector defaultPeriod="3m" />
      </LanguageProvider>,
    )
    expect(screen.getByRole('tab', { name: '1月' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '3月' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '6月' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '1年' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '全部' })).toBeInTheDocument()
  })

  it('渲染 5 个 tab 触发器 (en)', () => {
    render(
      <LanguageProvider initialLang="en">
        <PeriodSelector defaultPeriod="3m" />
      </LanguageProvider>,
    )
    expect(screen.getByRole('tab', { name: '1M' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ALL' })).toBeInTheDocument()
  })

  it('defaultPeriod 对应的 tab 处于激活态', () => {
    render(
      <LanguageProvider initialLang="zh">
        <PeriodSelector defaultPeriod="6m" />
      </LanguageProvider>,
    )
    expect(screen.getByRole('tab', { name: '6月' })).toHaveAttribute(
      'data-state',
      'active',
    )
    expect(screen.getByRole('tab', { name: '3月' })).toHaveAttribute(
      'data-state',
      'inactive',
    )
  })

  it('点击不同 tab 调用 router.push 更新 ?period=', async () => {
    mockPathname.mockReturnValueOnce('/market/600000')
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <PeriodSelector defaultPeriod="3m" />
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('tab', { name: '1年' }))
    expect(mockPush).toHaveBeenCalledWith('/market/600000?period=1y')
  })

  it('点击 all tab 也正确传参', async () => {
    mockPathname.mockReturnValueOnce('/market/600000')
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <PeriodSelector defaultPeriod="3m" />
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('tab', { name: '全部' }))
    expect(mockPush).toHaveBeenCalledWith('/market/600000?period=all')
  })
})