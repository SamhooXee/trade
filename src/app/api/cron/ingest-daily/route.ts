import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/data'
import { ingestDailyBars, getLastSyncedAt, setLastSyncedAt } from '@/lib/data/ingest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * 日终入库。从 Mock (或未来 Tushare) 拉取从 last_synced_at 至今的日线,
 * upsert 到 trade260915a_quant_daily_bars, 更新 last_synced_at。
 *
 * 安全: 仅 Vercel Cron (带 CRON_SECRET bearer token) 可调用。
 * 频率: 每日 16:20 北京 (UTC 8:20)。
 */

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = getProvider()
  const supabase = getServiceRoleClient() as any

  const { data: symbols, error: symErr } = await supabase
    .from('trade260915a_quant_symbols')
    .select('code')
  if (symErr) {
    return NextResponse.json({ error: `symbol query failed: ${symErr.message}` }, { status: 500 })
  }

  const lastSync = await getLastSyncedAt('daily')
  const today = new Date().toISOString().slice(0, 10)

  let totalUpserted = 0
  for (const { code } of symbols ?? []) {
    const bars = await provider.getDailyBarsSince(code, lastSync.slice(0, 10))
    if (bars.length === 0) continue
    const result = await ingestDailyBars(bars)
    totalUpserted += result.upserted
  }

  await setLastSyncedAt('daily', new Date().toISOString())

  return NextResponse.json({
    ok: true,
    symbols: symbols?.length ?? 0,
    upserted: totalUpserted,
    lastSync,
    today,
  })
}