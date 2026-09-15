'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/strategy', label: '策略' },
  { href: '/backtest', label: '回测' },
  { href: '/portfolio', label: '持仓' },
  { href: '/market', label: '行情' },
]

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname()
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold text-gray-900">
          Trade · Quant
        </Link>
        <ul className="flex items-center gap-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'text-sm hover:text-indigo-600',
                  pathname?.startsWith(link.href)
                    ? 'text-indigo-600 font-medium'
                    : 'text-gray-700',
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <span className="text-sm text-gray-600">{email}</span>
    </nav>
  )
}