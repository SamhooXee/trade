import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
import { Forbidden } from '@/components/auth/forbidden'
import { AdminConsole } from '@/components/admin/admin-console'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  if (!isAdmin(user)) return <Forbidden />

  const { data: dbKeys } = await supabase
    .from('block1_keys')
    .select('*, profile:block1_profiles(email)')
    .order('created_at', { ascending: false })

  interface DbKey {
    id: string
    code: string
    points: number
    status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
    expires_at: string
    created_at: string
    redeemed_at: string | null
    profile: { email: string | null } | null
  }

  const keys = ((dbKeys || []) as unknown as DbKey[]).map((k) => ({
    id: k.id,
    code: k.code,
    points: k.points,
    status: k.status,
    expiresAt: k.expires_at,
    createdAt: k.created_at,
    redeemedAt: k.redeemed_at,
    redeemedBy: k.profile ? k.profile.email : null,
  }))

  return <AdminConsole email={user.email ?? ''} initialKeys={keys} />
}
