import { describe, it, expect } from 'vitest'
import { FACTORS, getFactor, listFactors } from './registry'

describe('FACTORS registry', () => {
  it('contains all 6 factors keyed by id', () => {
    expect(Object.keys(FACTORS).sort()).toEqual(
      ['MA_CROSS', 'PE_TTM', 'RETURN_20D', 'RETURN_5D', 'RETURN_60D', 'VOLUME_RATIO'],
    )
  })
})

describe('getFactor', () => {
  it('returns factor for known id', () => {
    expect(getFactor('RETURN_20D').id).toBe('RETURN_20D')
  })

  it('throws for unknown id', () => {
    expect(() => getFactor('UNKNOWN' as any)).toThrow(/Unknown factor/)
  })
})

describe('listFactors', () => {
  it('returns 6 factors in id order', () => {
    const list = listFactors()
    expect(list.length).toBe(6)
    expect(list.map((f) => f.id)).toEqual(
      ['RETURN_5D', 'RETURN_20D', 'RETURN_60D', 'MA_CROSS', 'VOLUME_RATIO', 'PE_TTM'],
    )
  })
})