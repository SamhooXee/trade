import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/actions/auth'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-6">
        <span className="font-semibold text-gray-900">Block1</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              退出 / Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-2xl text-gray-700 text-center">
          欢迎回来 / Welcome back 👋
        </p>
      </main>
    </div>
  )
}
