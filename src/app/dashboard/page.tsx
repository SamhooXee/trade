import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/actions/auth'
import { isAdmin } from '@/lib/auth/roles'
import { RedeemForm } from '@/components/dashboard/redeem-form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Coins, History, User, Key, LogOut, Settings } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

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
    return new Date(dateStr).toLocaleString('zh-CN', {
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

          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200/60 rounded-full py-1.5 px-4">
            <Coins className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700">当前积分 / Points:</span>
            <span className="text-sm font-bold text-amber-800">{points}</span>
          </div>

          {isUserAdmin && (
            <Link href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1">
              <Settings className="h-4 w-4" /> 管理控制台 / Admin
            </Link>
          )}

          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-gray-500 hover:text-rose-600 transition-colors">
              <LogOut className="h-4 w-4 mr-1" /> 退出 / Sign out
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
                <Key className="h-5 w-5 text-indigo-600" /> 兑换激活码 / Redeem Key
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                输入激活码(Activation Key)即可兑换对应的积分，充值到个人账户中。
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
                <History className="h-5 w-5 text-indigo-600" /> 兑换历史 / Redemption History
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                您在此账户下成功兑换的所有激活码历史记录。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-y border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3 font-semibold">激活码 / Key Code</th>
                      <th className="px-6 py-3 font-semibold">积分值 / Points</th>
                      <th className="px-6 py-3 font-semibold">兑换时间 / Redeemed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {!history || history.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-500 text-xs">
                          暂无兑换记录 / No redemption history
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
