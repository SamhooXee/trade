import { describe, it, expect } from 'vitest'
import { renderRiskMessage, RISK_MESSAGES } from './messages'

describe('renderRiskMessage', () => {
  it('returns English message when locale=en', () => {
    const out = renderRiskMessage('INSUFFICIENT_BUYING_POWER', 'en')
    expect(out).toBe('Not enough cash to place this order')
  })

  it('returns Chinese message when locale=zh', () => {
    const out = renderRiskMessage('INSUFFICIENT_BUYING_POWER', 'zh')
    expect(out).toBe('可用资金不足,无法下单')
  })

  it('substitutes {pct} placeholder', () => {
    const out = renderRiskMessage('MAX_POSITION_PCT', 'en', { pct: 25 })
    expect(out).toBe('Single position would exceed 25% of equity')
  })

  it('substitutes multiple placeholders', () => {
    const out = renderRiskMessage('MAX_POSITIONS', 'zh', { count: 8, limit: 5 })
    expect(out).toBe('持仓数 8 超过上限 5')
  })

  it('falls back to code when unknown', () => {
    expect(renderRiskMessage('UNKNOWN_RULE', 'en')).toBe('UNKNOWN_RULE')
  })

  it('has both en and zh for all known codes', () => {
    for (const code of Object.keys(RISK_MESSAGES)) {
      expect(RISK_MESSAGES[code].en).toBeTruthy()
      expect(RISK_MESSAGES[code].zh).toBeTruthy()
    }
  })
})