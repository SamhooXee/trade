'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import type { EquityPoint } from '@/lib/backtest'

interface EquityCurveChartProps {
  data: EquityPoint[]
  height?: number
}

/**
 * 权益曲线图。x 轴日期, y 轴权益(元)。
 */
export function EquityCurveChart({ data, height = 320 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

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
        timeVisible: false,
        borderColor: '#e5e7eb',
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
      },
    })
    chartRef.current = chart

    const series = chart.addAreaSeries({
      lineColor: '#6366f1', // indigo-500
      topColor: 'rgba(99, 102, 241, 0.4)',
      bottomColor: 'rgba(99, 102, 241, 0.04)',
      lineWidth: 2,
    })
    seriesRef.current = series

    series.setData(
      data.map((p) => ({
        time: p.date,
        value: p.equity,
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