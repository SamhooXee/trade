/**
 * 把 Mock provider 的所有 symbol 一次性导入到 trade260915a_quant_symbols。
 * 仅本地开发用。生产环境用真实数据源的初始化脚本替代。
 *
 * 运行: pnpm seed:symbols
 */
import { getProvider } from '../src/lib/data'
import { getServiceRoleClient } from '../src/lib/supabase/service-role'

async function main() {
  const provider = getProvider()
  const supabase = getServiceRoleClient() as any

  console.log('Fetching symbols from MockDataProvider...')
  const symbols = await provider.listSymbols()
  console.log(`Got ${symbols.length} symbols`)

  const rows = symbols.map((s) => ({
    code: s.code,
    market: s.market,
    name: s.name,
    list_date: s.listDate,
    delist_date: s.delistDate,
    is_mainboard: true,
  }))

  console.log('Upserting to Supabase...')
  const { error } = await supabase
    .from('trade260915a_quant_symbols')
    .upsert(rows, { onConflict: 'code' })
  if (error) throw new Error(error.message)

  console.log(`Done. ${rows.length} symbols in DB.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})