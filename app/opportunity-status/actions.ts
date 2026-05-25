'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { logAuditAction } from '@/lib/audit'

const ALLOWED_STATUS = new Set(['active', 'closed', 'taken'])

export async function setOpportunityStatus(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/opportunities?error=Supabase%20is%20not%20configured')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.is_anonymous) {
    redirect('/opportunities?error=Temporary%20session%20cannot%20save%20opportunity%20status')
  }

  const opportunityId = String(formData.get('opportunityId') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const returnToRaw = String(formData.get('returnTo') ?? '').trim()

  const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/opportunities'

  if (!opportunityId) {
    redirect(`${returnTo}?error=Opportunity%20is%20required`)
  }

  if (!ALLOWED_STATUS.has(status)) {
    redirect(`${returnTo}?error=Invalid%20opportunity%20status`)
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const statusLabel = status === 'active' ? 'active/attempting' : status

  const { error } = await supabase
    .from('company_opportunity_statuses')
    .upsert({
      company_id: company.id,
      opportunity_id: opportunityId,
      status,
    }, { onConflict: 'company_id,opportunity_id' })

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`)
  }

  await logAuditAction({
    actorUserId: user.id,
    action: 'opportunity.status_updated',
    entityType: 'opportunity',
    entityId: opportunityId,
    metadata: {
      status,
      companyId: company.id,
    },
  })

  redirect(`${returnTo}?message=${encodeURIComponent(`Opportunity marked as ${statusLabel}`)}`)
}
