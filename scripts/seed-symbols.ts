/**
 * 把 Mock provider 的 symbol 样本导入到 trade260915a_quant_symbols。
 * 仅本地开发用。生产环境用真实数据源的初始化脚本替代。
 *
 * 运行: pnpm seed:symbols
 *
 * 注: MockDataProvider 枚举了 ~6000 只主板代码,这里只取前 N 条作为开发样本,
 * 避免本地 Supabase 装太多行。要灌全量请改 SEED_LIMIT。
 */
import { getProvider } from '../src/lib/data'
import { getServiceRoleClient } from '../src/lib/supabase/service-role'

const SEED_LIMIT = 100

async function main() {
  const provider = getProvider()
  const supabase = getServiceRoleClient()

  console.log('Fetching symbols from MockDataProvider...')
  const all = await provider.listSymbols()
  const symbols = all.slice(0, SEED_LIMIT)
  console.log(`Got ${all.length} symbols, taking first ${symbols.length}`)

  const rows = symbols.map((s) => ({
    code: s.code,
    market: s.market,
    name: s.name,
    list_date: s.listDate,
    delist_date: s.delistDate,
    is_mainboard: true,
  }))

  console.log('Upserting to Supabase...')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trade260915a_quant_symbols')
    .upsert(rows, { onConflict: 'code' })
  if (error) throw new Error(error.message)

  console.log(`Done. ${rows.length} symbols in DB.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})