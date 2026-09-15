import { describe, it, expect } from 'vitest'
import type { DailyBar } from '@/lib/data'
import type { Factor, FactorContext, FactorParam, FactorId } from './types'
import { FACTOR_IDS } from './types'

describe('Factor interface', () => {
  it('Factor shape — minimum required fields', () => {
    const f: Factor = {
      id: 'RETURN_20D',
      label: '20日收益率',
      labelEn: '20-Day Return',
      description: '过去 20 个交易日的累计收益率',
      descriptionEn: 'Cumulative return over the last 20 trading days',
      params: [],
      compute: () => 0.05,
    }
    expect(f.id).toBe('RETURN_20D')
    expect(f.params).toEqual([])
  })

  it('Factor with params', () => {
    const f: Factor = {
      id: 'MA_CROSS',
      label: '均线交叉',
      labelEn: 'MA Cross',
      description: '快线上穿 / 下穿慢线',
      descriptionEn: 'Fast MA crosses slow MA',
      params: [
        { key: 'fastPeriod', label: '快线周期', labelEn: 'Fast Period', min: 2, max: 60, default: 5 },
        { key: 'slowPeriod', label: '慢线周期', labelEn: 'Slow Period', min: 5, max: 250, default: 20 },
      ],
      compute: () => null,
    }
    expect(f.params.length).toBe(2)
    expect(f.params[0].default).toBe(5)
  })
})

describe('FACTOR_IDS', () => {
  it('contains exactly 6 factor ids', () => {
    expect(FACTOR_IDS.length).toBe(6)
    expect(FACTOR_IDS).toContain('RETURN_5D')
    expect(FACTOR_IDS).toContain('RETURN_20D')
    expect(FACTOR_IDS).toContain('RETURN_60D')
    expect(FACTOR_IDS).toContain('MA_CROSS')
    expect(FACTOR_IDS).toContain('VOLUME_RATIO')
    expect(FACTOR_IDS).toContain('PE_TTM')
  })
})