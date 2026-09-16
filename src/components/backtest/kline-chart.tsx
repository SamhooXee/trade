'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import type { DailyBar } from '@/lib/data'

interface KlineChartProps {
  data: DailyBar[]
  height?: number
}

/**
 * K 线图(蜡烛图)。日线 / 分钟线通用。
 */
export function KlineChart({ data, height = 360 }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#374151',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      timeScale: {
        borderColor: '#e5e7eb',
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
      },
    })
    chartRef.current = chart

    const series = chart.addCandlestickSeries({
      upColor: '#ef4444',  // A 股红涨绿跌
      downColor: '#10b981',
      borderUpColor: '#ef4444',
      borderDownColor: '#10b981',
      wickUpColor: '#ef4444',
      wickDownColor: '#10b981',
    })
    seriesRef.current = series

    series.setData(
      data.map((b) => ({
        time: b.tradeDate,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [data, height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}