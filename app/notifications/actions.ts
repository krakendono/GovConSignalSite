'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

export async function markAllNotificationsRead() {
  if (!isSupabaseConfigured()) {
    redirect('/notifications?error=Supabase%20is%20not%20configured')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const { error } = await supabase
    .from('watchlist_notifications')
    .update({ is_read: true })
    .eq('company_id', company.id)
    .eq('is_read', false)

  if (error) {
    redirect(`/notifications?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/notifications?message=Notifications%20marked%20as%20read')
}
