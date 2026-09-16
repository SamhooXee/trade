/**
 * 风控规则的 i18n 文案(供 UI 与 cron 日志复用)。
 * key 与 RiskReasonCode 一一对应。
 */
export interface RiskMessage {
  /** en */
  en: string
  /** zh */
  zh: string
}

export const RISK_MESSAGES: Record<string, RiskMessage> = {
  INSUFFICIENT_BUYING_POWER: {
    en: 'Not enough cash to place this order',
    zh: '可用资金不足,无法下单',
  },
  INSUFFICIENT_SELLABLE_SHARES: {
    en: 'Insufficient sellable shares (T+1 lock)',
    zh: '可卖股数不足(T+1 解禁未到)',
  },
  MAX_POSITION_PCT: {
    en: 'Single position would exceed {pct}% of equity',
    zh: '单仓位超过权益的 {pct}%',
  },
  MAX_POSITIONS: {
    en: 'Number of positions {count} exceeds limit {limit}',
    zh: '持仓数 {count} 超过上限 {limit}',
  },
  MAX_TOTAL_EXPOSURE: {
    en: 'Total exposure would exceed {pct}% of equity',
    zh: '总仓位超过权益的 {pct}%',
  },
  MAX_DRAWDOWN_STOP: {
    en: 'Drawdown {pct}% breached limit {limit}%, strategy stopped',
    zh: '回撤 {pct}% 超过止损 {limit}%,策略已停止',
  },
}

/** 渲染消息(把 {key} 替换成 params) */
export function renderRiskMessage(
  code: string,
  locale: 'en' | 'zh',
  params: Record<string, string | number> = {},
): string {
  const m = RISK_MESSAGES[code]?.[locale] ?? code
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    m,
  )
}