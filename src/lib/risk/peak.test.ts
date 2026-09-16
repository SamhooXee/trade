import { describe, it, expect } from 'vitest'
import { computePeakEquity } from './peak'
import type { Portfolio, EquitySnapshot } from '@/lib/trading'

function mkPortfolio(): Portfolio {
  return {
    id: 'p1',
    userId: 'u1',
    strategyId: 's1',
    cash: 1_000_000,
    initialCash: 1_000_000,
    status: 'active',
    stopReason: null,
    startedAt: '2026-09-01T00:00:00Z',
    stoppedAt: null,
  }
}

function mkSnap(date: string, equity: number): EquitySnapshot {
  return {
    id: `s-${date}`,
    userId: 'u1',
    portfolioId: 'p1',
    tradeDate: date,
    equity,
    cash: equity,
    marketValue: 0,
    recordedAt: `${date}T15:10:00Z`,
  }
}

describe('computePeakEquity', () => {
  it('returns current equity when no snapshots', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(),
      currentEquity: 950_000,
      snapshots: [],
    })
    expect(peak).toBe(950_000)
  })

  it('returns MAX(snapshot.equity, currentEquity)', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(),
      currentEquity: 900_000,
      snapshots: [
        mkSnap('2026-09-10', 1_050_000),
        mkSnap('2026-09-12', 1_100_000),
      ],
    })
    expect(peak).toBe(1_100_000)
  })

  it('currentEquity wins when higher than all snapshots', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(),
      currentEquity: 1_200_000,
      snapshots: [mkSnap('2026-09-10', 1_100_000)],
    })
    expect(peak).toBe(1_200_000)
  })

  it('returns 0 when both are 0 (defensive)', () => {
    const peak = computePeakEquity({
      portfolio: mkPortfolio(),
      currentEquity: 0,
      snapshots: [],
    })
    expect(peak).toBe(0)
  })
})