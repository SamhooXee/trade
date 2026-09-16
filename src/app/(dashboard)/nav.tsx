'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/providers/language-provider'
import { signOutAction } from '@/app/actions/auth'

const links = [
  { href: '/strategy', label: '策略' },
  { href: '/backtest', label: '回测' },
  { href: '/portfolio', label: '持仓' },
  { href: '/market', label: '行情' },
]

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname()
  const { t } = useLanguage()
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
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{email}</span>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 mr-1" />
            {t('common.signOut')}
          </Button>
        </form>
      </div>
    </nav>
  )
}