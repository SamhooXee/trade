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

  return <AdminConsole email={user.email ?? ''} />
}
