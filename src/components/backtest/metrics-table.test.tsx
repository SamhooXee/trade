import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/components/providers/language-provider'
import { MetricsTable } from './metrics-table'
import type { Metrics } from '@/lib/backtest'

const renderWith = (ui: React.ReactNode) =>
  render(<LanguageProvider initialLang="zh">{ui}</LanguageProvider>)

const sampleMetrics: Metrics = {
  totalReturn: 0.123,
  annualizedReturn: 0.087,
  maxDrawdown: -0.082,
  sharpeRatio: 1.24,
  winRate: 0.45,
  totalTrades: 28,
  avgHoldingDays: 5.2,
}

describe('MetricsTable', () => {
  it('renders all 8 metric labels', () => {
    renderWith(<MetricsTable metrics={sampleMetrics} initialCash={1_000_000} finalEquity={1_123_000} />)
    expect(screen.getByText(/总收益|total return/i)).toBeInTheDocument()
    expect(screen.getByText(/年化|annualized/i)).toBeInTheDocument()
    expect(screen.getByText(/最大回撤|max drawdown/i)).toBeInTheDocument()
    expect(screen.getByText(/夏普|sharpe/i)).toBeInTheDocument()
    expect(screen.getByText(/胜率|win rate/i)).toBeInTheDocument()
    expect(screen.getByText(/总交易|total trades/i)).toBeInTheDocument()
    expect(screen.getByText(/平均持仓|avg holding/i)).toBeInTheDocument()
  })

  it('formats total return with sign and percent', () => {
    renderWith(<MetricsTable metrics={sampleMetrics} initialCash={1_000_000} finalEquity={1_123_000} />)
    expect(screen.getByText(/\+12\.30%/)).toBeInTheDocument()
  })
})