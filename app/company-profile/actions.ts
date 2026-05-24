'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { logAuditAction } from '@/lib/audit'

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCodeCsv(value: string) {
  return parseCsv(value).map((item) => item.toUpperCase())
}

export async function saveCompanyProfile(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/company-profile?error=Supabase%20is%20not%20configured')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.is_anonymous) {
    redirect('/company-profile?error=Temporary%20session%20is%20read-only.%20Sign%20in%20to%20save%20company%20data')
  }

  const companyName = String(formData.get('companyName') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim()
  const capabilityStatement = String(formData.get('capabilityStatement') ?? '').trim()
  const teamSize = String(formData.get('teamSize') ?? '').trim()
  const geographicCoverage = String(formData.get('geographicCoverage') ?? '').trim()
  const certifications = parseCsv(String(formData.get('certifications') ?? ''))
  const preferredAgencies = parseCsv(String(formData.get('preferredAgencies') ?? ''))
  const keywords = parseCsv(String(formData.get('keywords') ?? ''))
  const excludedIndustries = parseCsv(String(formData.get('excludedIndustries') ?? ''))
  const naicsCodes = parseCodeCsv(String(formData.get('naicsCodes') ?? ''))
  const pscCodes = parseCodeCsv(String(formData.get('pscCodes') ?? ''))

  if (!companyName) {
    redirect('/company-profile?error=Company%20name%20is%20required')
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .upsert(
      {
        owner_user_id: user.id,
        name: companyName,
        website: website || null,
      },
      { onConflict: 'owner_user_id' },
    )
    .select('id')
    .single()

  if (companyError || !company) {
    redirect(`/company-profile?error=${encodeURIComponent(companyError?.message ?? 'Company save failed')}`)
  }

  const companyId = company.id

  const { error: profileError } = await supabase.from('company_profiles').upsert({
    company_id: companyId,
    capability_statement: capabilityStatement || null,
    certifications,
    team_size: teamSize || null,
    geographic_coverage: geographicCoverage || null,
    preferred_agencies: preferredAgencies,
    keywords,
    excluded_industries: excludedIndustries,
  })

  if (profileError) {
    redirect(`/company-profile?error=${encodeURIComponent(profileError.message)}`)
  }

  await supabase.from('company_naics_codes').delete().eq('company_id', companyId)
  await supabase.from('company_psc_codes').delete().eq('company_id', companyId)

  if (naicsCodes.length > 0) {
    await supabase.from('naics_codes').upsert(naicsCodes.map((code) => ({ code })), { onConflict: 'code' })
    await supabase.from('company_naics_codes').insert(
      naicsCodes.map((code) => ({ company_id: companyId, naics_code: code })),
    )
  }

  if (pscCodes.length > 0) {
    await supabase.from('psc_codes').upsert(pscCodes.map((code) => ({ code })), { onConflict: 'code' })
    await supabase.from('company_psc_codes').insert(
      pscCodes.map((code) => ({ company_id: companyId, psc_code: code })),
    )
  }

  const { error: userUpsertError } = await supabase.from('users').upsert({
    id: user.id,
    primary_company_id: companyId,
  })

  if (userUpsertError) {
    redirect(`/company-profile?error=${encodeURIComponent(userUpsertError.message)}`)
  }

  await logAuditAction({
    actorUserId: user.id,
    action: 'company_profile.saved',
    entityType: 'company',
    entityId: companyId,
    metadata: {
      hasWebsite: Boolean(website),
      naicsCount: naicsCodes.length,
      pscCount: pscCodes.length,
      keywordsCount: keywords.length,
    },
  })

  redirect('/company-profile?message=Profile%20saved')
}
