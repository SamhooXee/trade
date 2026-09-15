import { describe, it, expect } from 'vitest'
import { strategySpecSchema, conditionSchema, holdingSchema } from './types'

describe('conditionSchema', () => {
  it('accepts a valid condition', () => {
    const r = conditionSchema.safeParse({
      factor: 'RETURN_20D',
      params: {},
      comparator: '>',
      threshold: 0,
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown factor', () => {
    const r = conditionSchema.safeParse({
      factor: 'UNKNOWN',
      params: {},
      comparator: '>',
      threshold: 0,
    })
    expect(r.success).toBe(false)
  })

  it('rejects unknown comparator', () => {
    const r = conditionSchema.safeParse({
      factor: 'RETURN_20D',
      params: {},
      comparator: '==',
      threshold: 0,
    })
    expect(r.success).toBe(false)
  })
})

describe('holdingSchema', () => {
  it('applies defaults', () => {
    const r = holdingSchema.parse({})
    expect(r.maxPositions).toBe(5)
    expect(r.positionSizePct).toBe(20)
    expect(r.maxDrawdownPct).toBe(20)
  })

  it('rejects positionSizePct > 100', () => {
    const r = holdingSchema.safeParse({ positionSizePct: 150 })
    expect(r.success).toBe(false)
  })

  it('rejects maxDrawdownPct <= 0', () => {
    const r = holdingSchema.safeParse({ maxDrawdownPct: 0 })
    expect(r.success).toBe(false)
  })
})

describe('strategySpecSchema', () => {
  it('accepts a minimal full spec', () => {
    const r = strategySpecSchema.safeParse({
      entry: { combinator: 'AND', conditions: [] },
      exit: { combinator: 'OR', conditions: [] },
      holding: {},
    })
    expect(r.success).toBe(true)
  })
})