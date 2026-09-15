import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthCard } from '@/components/auth/auth-card'
import { LanguageSwitcher } from '@/components/providers/language-provider'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      <div className="absolute top-6 right-6 z-50">
        <LanguageSwitcher />
      </div>
      <h1 className="text-3xl font-semibold mb-8 text-gray-900 tracking-tight">Trade</h1>
      <AuthCard />
    </main>
  )
}

