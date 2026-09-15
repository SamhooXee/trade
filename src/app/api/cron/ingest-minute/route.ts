import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/data'
import { ingestMinuteBars, getLastSyncedAt, setLastSyncedAt } from '@/lib/data/ingest'
import { getServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * 分钟线入库。从 Mock 拉取最新分钟线,upsert 到 trade260915a_quant_minute_bars。
 *
 * 频率: 交易日 9:35-11:30 / 13:05-15:00 每 5 分钟 (配置见 vercel.json)。
 */

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = getProvider()
  const supabase = getServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: symbols } = await (supabase as any)
    .from('trade260915a_quant_symbols')
    .select('code')

  const lastSync = await getLastSyncedAt('minute')

  let totalUpserted = 0
  for (const { code } of symbols ?? []) {
    const bars = await provider.getMinuteBarsSince(code, lastSync)
    if (bars.length === 0) continue
    const result = await ingestMinuteBars(bars)
    totalUpserted += result.upserted
  }

  await setLastSyncedAt('minute', new Date().toISOString())

  return NextResponse.json({
    ok: true,
    symbols: symbols?.length ?? 0,
    upserted: totalUpserted,
  })
}