import type { Factor } from './types'
import { volumeRatio } from './helpers'

export const VOLUME_RATIO: Factor = {
  id: 'VOLUME_RATIO',
  label: '量比',
  labelEn: 'Volume Ratio',
  description: '今日成交量与过去 N 日均量之比(>1 表示放量)',
  descriptionEn: 'Today volume / N-day average volume (>1 means expansion)',
  params: [
    { key: 'period', label: '回看天数', labelEn: 'Lookback Days', min: 2, max: 60, default: 5 },
  ],
  compute: (bars, params) => volumeRatio(bars, params.period),
}