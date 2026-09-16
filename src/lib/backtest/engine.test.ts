import { describe, it, expect } from 'vitest'
import { runBacktest } from './engine'
import type { StrategySpec } from '@/lib/strategy'
import type { DailyBar } from '@/lib/data'

/**
 * 构造一个最小回测场景:
 * - 1 只股票 600000
 * - 5 个交易日 (T1..T5)
 * - 收盘价线性上升 10,11,12,13,14
 * - 策略:entry { AND [] } → vacuously true;exit { OR [] } → vacuously false
 *   → 每天满足入场,只要未触发 exit 就一直持仓。
 *
 * 信号:T1 收盘 → T2 open 买入 → 持仓 → 没有 exit → 继续持仓。
 * 撮合引擎约定:nextBar.close = prevClose(用于涨跌停判定)。
 */

function mkBar(date: string, close: number): DailyBar {
  return {
    symbolCode: '600000',
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    amount: close * 1_000_000,
  }
}

describe('runBacktest — basic 5-day buy-and-hold', () => {
  // 收盘价小幅递增,避免触发涨跌停(每步涨幅 < 10%)
  const barsBySymbol = new Map<string, DailyBar[]>([
    [
      '600000',
      [
        mkBar('2026-09-01', 10),
        mkBar('2026-09-02', 10.95),
        mkBar('2026-09-03', 11.95),
        mkBar('2026-09-04', 12.95),
        mkBar('2026-09-05', 13.95),
      ],
    ],
  ])

  // mock close = 前一日 close (用于涨跌停判定)
  const barsByFill = new Map<string, DailyBar[]>([
    [
      '600000',
      [
        // T1 close = 10, T2 open = 10.95 (gap < 10%)
        { ...mkBar('2026-09-02', 10.95), close: 10 },
        // T2 close = 10.95, T3 open = 11.95 (gap < 10%)
        { ...mkBar('2026-09-03', 11.95), close: 10.95 },
        // T3 close = 11.95, T4 open = 12.95 (gap < 10%)
        { ...mkBar('2026-09-04', 12.95), close: 11.95 },
        // T4 close = 12.95, T5 open = 13.95 (gap < 10%)
        { ...mkBar('2026-09-05', 13.95), close: 12.95 },
      ],
    ],
  ])

  const spec: StrategySpec = {
    entry: { combinator: 'AND', conditions: [] }, // vacuously true
    exit: { combinator: 'OR', conditions: [] },   // vacuously false
    holding: { maxPositions: 1, positionSizePct: 100, maxDrawdownPct: 50 },
  }

  it('runs and produces trades + equity curve', async () => {
    const out = await runBacktest({
      spec,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      initialCash: 1_000_000,
      symbols: ['600000'],
      loadBars: async (sym, _from, _to) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym, _from, _to) => barsByFill.get(sym) ?? [],
      isTradingDay: () => true,
    })

    // 验证基本形状
    expect(out.trades.length).toBeGreaterThanOrEqual(1) // 至少 1 BUY (无 exit,不卖)
    expect(out.trades[0].side).toBe('BUY')
    // equity curve 5 个点
    expect(out.equityCurve.length).toBe(5)
    // final equity > initial cash(涨)
    expect(out.finalEquity).toBeGreaterThan(out.initialCash)
    expect(out.metrics.totalReturn).toBeGreaterThan(0)
  })

  it('uses T+1 open price for fill', async () => {
    const out = await runBacktest({
      spec,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      initialCash: 1_000_000,
      symbols: ['600000'],
      loadBars: async (sym) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym) => barsByFill.get(sym) ?? [],
      isTradingDay: () => true,
    })

    // 第一笔 BUY 应该在 T2 09-02 成交,价格 = 10.95 (T2 open)
    expect(out.trades[0].date).toBe('2026-09-02')
    expect(out.trades[0].price).toBe(10.95)
  })

  it('is deterministic across runs', async () => {
    const args = {
      spec,
      startDate: '2026-09-01' as const,
      endDate: '2026-09-05' as const,
      initialCash: 1_000_000,
      symbols: ['600000'] as string[],
      loadBars: async (sym: string) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym: string) => barsByFill.get(sym) ?? [],
      isTradingDay: () => true,
    }
    const a = await runBacktest(args)
    const b = await runBacktest(args)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('triggers SELL when exit condition hits', async () => {
    // entry always true,exit at T2 close triggers
    const specWithExit: StrategySpec = {
      entry: { combinator: 'AND', conditions: [] },
      exit: { combinator: 'AND', conditions: [] }, // exit immediately when holding
      holding: { maxPositions: 1, positionSizePct: 100, maxDrawdownPct: 50 },
    }
    const out = await runBacktest({
      spec: specWithExit,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      initialCash: 1_000_000,
      symbols: ['600000'],
      loadBars: async (sym) => barsBySymbol.get(sym) ?? [],
      loadBarsForFill: async (sym) => barsByFill.get(sym) ?? [],
      isTradingDay: () => true,
    })
    // 至少 1 BUY + 1 SELL
    expect(out.trades.length).toBeGreaterThanOrEqual(2)
    expect(out.trades[0].side).toBe('BUY')
    expect(out.trades[1].side).toBe('SELL')
  })
})