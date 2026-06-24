import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/actions/auth'
import { isAdmin } from '@/lib/auth/roles'
import { RedeemForm } from '@/components/dashboard/redeem-form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Coins, History, User, Key, LogOut, Settings } from 'lucide-react'
import { getTranslations } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/providers/language-provider'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { t, lang } = await getTranslations()

  // Fetch points balance from block1_profiles
  let points = 0
  const { data: profile, error: profileError } = await supabase
    .from('block1_profiles')
    .select('points')
    .eq('id', user.id)
    .maybeSingle()

  if (profile) {
    points = profile.points
  } else if (!profileError) {
    // Upsert profile row if it doesn't exist
    const { data: newProfile } = await supabase
      .from('block1_profiles')
      .insert({ id: user.id, email: user.email, points: 0 })
      .select('points')
      .maybeSingle()
    if (newProfile) points = newProfile.points
  }

  // Fetch redemption history
  const { data: history } = await supabase
    .from('block1_keys')
    .select('*')
    .eq('user_id', user.id)
    .order('redeemed_at', { ascending: false })

  const isUserAdmin = isAdmin(user)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50/50 to-fuchsia-50/50">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-indigo-100/40 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <Coins className="h-5 w-5" />
          </div>
          <span className="font-bold text-gray-900 tracking-tight text-lg">Block1</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100/40 rounded-full py-1.5 px-4">
            <User className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-900">{user.email}</span>
          </div>

          <LanguageSwitcher />

          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200/60 rounded-full py-1.5 px-4">
            <Coins className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{t('dashboard.currentPoints')}:</span>
            <span className="text-sm font-bold text-amber-800">{points}</span>
          </div>

          {isUserAdmin && (
            <Link href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1">
              <Settings className="h-4 w-4" /> {t('common.adminConsole')}
            </Link>
          )}

          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-gray-500 hover:text-rose-600 transition-colors cursor-pointer">
              <LogOut className="h-4 w-4 mr-1" /> {t('common.signOut')}
            </Button>
          </form>
        </div>
      </header>


      {/* Main Dashboard Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column - Redeem Form Card */}
        <div className="md:col-span-5 space-y-6">
          <Card className="border-0 shadow-lg shadow-indigo-100/60 bg-white/95 backdrop-blur-sm overflow-hidden">
            <div className="h-1.5 bg-indigo-600 w-full" />
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-600" /> {t('dashboard.redeemKey')}
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                {t('dashboard.redeemDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RedeemForm />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - History List Card */}
        <div className="md:col-span-7 space-y-6">
          <Card className="border-0 shadow-lg shadow-indigo-100/60 bg-white/95 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" /> {t('dashboard.history')}
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                {t('dashboard.historyDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-y border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3 font-semibold">{t('dashboard.keyCode')}</th>
                      <th className="px-6 py-3 font-semibold">{t('dashboard.pointsVal')}</th>
                      <th className="px-6 py-3 font-semibold">{t('dashboard.redeemedAt')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {!history || history.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-500 text-xs font-medium">
                          {t('dashboard.noHistory')}
                        </td>
                      </tr>
                    ) : (
                      history.map((item) => (
                        <tr key={item.id} className="hover:bg-indigo-50/10 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                              {item.code}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-bold text-emerald-600 text-sm">
                              +{item.points}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                            {item.redeemed_at ? formatDate(item.redeemed_at) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

