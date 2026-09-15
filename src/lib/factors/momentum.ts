import type { Factor } from './types'
import { simpleReturn } from './helpers'

const build = (
  period: number,
  id: 'RETURN_5D' | 'RETURN_20D' | 'RETURN_60D',
  label: string,
  labelEn: string,
  desc: string,
  descEn: string,
): Factor => ({
  id,
  label,
  labelEn,
  description: desc,
  descriptionEn: descEn,
  params: [],
  compute: (bars) => simpleReturn(bars, period),
})

export const RETURN_5D: Factor = build(
  5,
  'RETURN_5D',
  '5日收益率',
  '5-Day Return',
  '过去 5 个交易日的累计收益率',
  'Cumulative return over the last 5 trading days',
)

export const RETURN_20D: Factor = build(
  20,
  'RETURN_20D',
  '20日收益率',
  '20-Day Return',
  '过去 20 个交易日的累计收益率',
  'Cumulative return over the last 20 trading days',
)

export const RETURN_60D: Factor = build(
  60,
  'RETURN_60D',
  '60日收益率',
  '60-Day Return',
  '过去 60 个交易日的累计收益率',
  'Cumulative return over the last 60 trading days',
)