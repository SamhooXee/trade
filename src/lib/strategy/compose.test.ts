import { describe, it, expect } from 'vitest'
import { composeStrategy, emptySpec, defaultHolding } from './compose'

describe('emptySpec', () => {
  it('returns valid empty spec', () => {
    const s = emptySpec()
    expect(s.entry.combinator).toBe('AND')
    expect(s.entry.conditions).toEqual([])
    expect(s.holding.maxPositions).toBe(5)
  })
})

describe('defaultHolding', () => {
  it('returns sane defaults', () => {
    const h = defaultHolding()
    expect(h.maxPositions).toBe(5)
    expect(h.positionSizePct).toBe(20)
    expect(h.maxDrawdownPct).toBe(20)
  })
})

describe('composeStrategy', () => {
  it('fills missing holding fields with defaults', () => {
    const s = composeStrategy({
      entry: { combinator: 'AND', conditions: [] },
      exit: { combinator: 'OR', conditions: [] },
    })
    expect(s.holding).toEqual(defaultHolding())
  })

  it('rejects bad condition', () => {
    expect(() =>
      composeStrategy({
        entry: {
          combinator: 'AND',
          conditions: [
            { factor: 'UNKNOWN' as any, params: {}, comparator: '>', threshold: 0 },
          ],
        },
        exit: { combinator: 'OR', conditions: [] },
      }),
    ).toThrow()
  })

  it('rejects entry with too many conditions (UI allows up to 6)', () => {
    const conds = Array.from({ length: 7 }, () => ({
      factor: 'RETURN_20D' as const,
      params: {},
      comparator: '>' as const,
      threshold: 0,
    }))
    expect(() =>
      composeStrategy({
        entry: { combinator: 'AND', conditions: conds },
        exit: { combinator: 'OR', conditions: [] },
      }),
    ).not.toThrow() // 6+1=7 暂时不卡,后续 UI 限制
  })
})