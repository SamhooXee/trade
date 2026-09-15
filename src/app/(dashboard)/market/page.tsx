import Link from 'next/link'
import { listSymbols } from '@/lib/data/query'

export default async function MarketPage() {
  const symbols = await listSymbols()
  const top = symbols.slice(0, 100) // MVP: 仅显示前 100,后续加分页

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">主板行情</h1>
        <span className="text-sm text-gray-600">
          共 {symbols.length} 只 (显示前 {top.length})
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">代码</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名称</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">市场</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {top.map((s) => (
              <tr key={s.code} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <Link href={`/market/${s.code}`} className="text-indigo-600 hover:underline">
                    {s.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{s.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.market}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}