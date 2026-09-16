'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/providers/language-provider'

export function Forbidden() {
  const { t } = useLanguage()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {t('auth.forbidden')}
        </h1>
        <p className="text-gray-600 mb-6">
          {t('auth.adminOnly')}
        </p>
        <Button asChild className="cursor-pointer">
          <Link href="/dashboard">{t('common.back')}</Link>
        </Button>
      </div>
    </main>
  )
}

