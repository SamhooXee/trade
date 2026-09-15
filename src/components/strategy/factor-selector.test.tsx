import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'
import { FactorSelector } from './factor-selector'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

describe('FactorSelector', () => {
  it('renders factor dropdown', () => {
    renderWith(
      <FactorSelector
        factorId="RETURN_20D"
        params={{}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /因子|factor/i })).toBeInTheDocument()
  })

  it('calls onChange when factor changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWith(
      <FactorSelector
        factorId="RETURN_20D"
        params={{}}
        onChange={onChange}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: /因子|factor/i }),
      'MA_CROSS',
    )
    expect(onChange).toHaveBeenCalledWith('MA_CROSS', { fastPeriod: 5, slowPeriod: 20 })
  })

  it('shows param inputs for factors with params', () => {
    renderWith(
      <FactorSelector
        factorId="MA_CROSS"
        params={{ fastPeriod: 5, slowPeriod: 20 }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByLabelText(/快线周期|fast period/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/慢线周期|slow period/i)).toBeInTheDocument()
  })
})