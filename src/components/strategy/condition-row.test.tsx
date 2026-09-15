import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'
import { ConditionRow } from './condition-row'
import type { Condition } from '@/lib/strategy'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

const baseCondition: Condition = {
  factor: 'RETURN_20D',
  params: {},
  comparator: '>',
  threshold: 0,
}

describe('ConditionRow', () => {
  it('renders factor selector, comparator, threshold', () => {
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /因子|factor/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /比较符|comparator/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/阈值|threshold/i)).toBeInTheDocument()
  })

  it('calls onChange when threshold changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={onChange}
        onRemove={() => {}}
      />,
    )
    const input = screen.getByLabelText(/阈值|threshold/i)
    await user.clear(input)
    await user.type(input, '0.05')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Condition
    expect(lastCall.threshold).toBeCloseTo(0.05, 2)
  })

  it('calls onRemove when remove button clicked', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <ConditionRow
        index={0}
        condition={baseCondition}
        onChange={() => {}}
        onRemove={onRemove}
      />,
    )
    await user.click(screen.getByRole('button', { name: /删除|remove/i }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})