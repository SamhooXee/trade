import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Forbidden() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          403 - 无权限 / Forbidden
        </h1>
        <p className="text-gray-600 mb-6">
          此页面仅限管理员访问 / This page is restricted to administrators.
        </p>
        <Button asChild>
          <Link href="/dashboard">返回 / Back</Link>
        </Button>
      </div>
    </main>
  )
}
