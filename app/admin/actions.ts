'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/env'
import { canAccessAdmin } from '@/lib/admin'
import { logAuditAction } from '@/lib/audit'

export async function updateUserAccountStatus(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/admin?error=Supabase%20is%20not%20configured')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (!canAccessAdmin(user.email)) {
    redirect('/dashboard?error=Admin%20access%20required')
  }

  const targetUserId = String(formData.get('targetUserId') ?? '').trim()
  const accountStatusRaw = String(formData.get('accountStatus') ?? 'active').trim().toLowerCase()
  const notes = String(formData.get('notes') ?? '').trim()

  if (!targetUserId) {
    redirect('/admin?error=Target%20user%20is%20required')
  }

  const accountStatus = accountStatusRaw === 'restricted' ? 'restricted' : 'active'

  const adminClient = createSupabaseAdminClient()
  const { error } = await adminClient.from('admin_user_status').upsert(
    {
      user_id: targetUserId,
      account_status: accountStatus,
      notes: notes || null,
      updated_by_user_id: user.id,
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`)
  }

  await logAuditAction({
    actorUserId: user.id,
    targetUserId,
    action: 'admin.user_status_updated',
    entityType: 'user',
    entityId: targetUserId,
    metadata: {
      accountStatus,
      notesLength: notes.length,
    },
  })

  redirect('/admin?message=User%20status%20updated')
}
