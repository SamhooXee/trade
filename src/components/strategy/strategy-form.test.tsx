import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'

// mock 必须在 import 之前
vi.mock('@/lib/strategy/actions', () => ({
  createStrategyAction: vi.fn().mockResolvedValue(null),
  updateStrategyAction: vi.fn().mockResolvedValue(null),
}))

import { createStrategyAction } from '@/lib/strategy/actions'
import { StrategyForm } from './strategy-form'
import { emptySpec } from '@/lib/strategy'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

describe('StrategyForm', () => {
  it('renders name, entry, exit, holding fields, 3 action buttons', () => {
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    expect(screen.getByLabelText(/策略名称|strategy name/i)).toBeInTheDocument()
    expect(screen.getByText(/入场条件|entry conditions/i)).toBeInTheDocument()
    expect(screen.getByText(/出场条件|exit conditions/i)).toBeInTheDocument()
    expect(screen.getByText(/持仓与风控|holding/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /取消|cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存草稿|save draft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存并启用|save & enable/i })).toBeInTheDocument()
  })

  it('adds entry condition when add button clicked', async () => {
    const user = userEvent.setup()
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    const addButtons = screen.getAllByRole('button', { name: /添加条件|add condition/i })
    await user.click(addButtons[0])
    expect(screen.getByText(/条件 #1/i)).toBeInTheDocument()
  })

  it('calls createStrategyAction on submit with valid spec', async () => {
    const user = userEvent.setup()
    renderWith(<StrategyForm initialSpec={emptySpec()} />)
    await user.type(screen.getByLabelText(/策略名称|strategy name/i), '我的策略')
    await user.click(screen.getByRole('button', { name: /保存草稿|save draft/i }))
    expect(createStrategyAction).toHaveBeenCalled()
  })
})