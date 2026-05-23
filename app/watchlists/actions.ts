'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCodeCsv(value: string) {
  return parseCsv(value).map((item) => item.toUpperCase())
}

export async function saveWatchlist(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/watchlists?error=Supabase%20is%20not%20configured')
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

  const name = String(formData.get('name') ?? '').trim()
  const keywords = parseCsv(String(formData.get('keywords') ?? ''))
  const naicsCodes = parseCodeCsv(String(formData.get('naicsCodes') ?? ''))
  const pscCodes = parseCodeCsv(String(formData.get('pscCodes') ?? ''))
  const exclusions = parseCsv(String(formData.get('exclusions') ?? ''))

  if (!name) {
    redirect('/watchlists?error=Watchlist%20name%20is%20required')
  }

  const { data: watchlist, error: watchlistError } = await supabase
    .from('watchlists')
    .insert({ company_id: company.id, name })
    .select('id')
    .single()

  if (watchlistError || !watchlist) {
    redirect(`/watchlists?error=${encodeURIComponent(watchlistError?.message ?? 'Watchlist save failed')}`)
  }

  if (keywords.length > 0) {
    await supabase.from('watchlist_keywords').insert(
      keywords.map((keyword) => ({ watchlist_id: watchlist.id, keyword })),
    )
  }

  if (naicsCodes.length > 0) {
    await supabase.from('naics_codes').upsert(naicsCodes.map((code) => ({ code })), { onConflict: 'code' })
    await supabase.from('watchlist_naics').insert(
      naicsCodes.map((naicsCode) => ({ watchlist_id: watchlist.id, naics_code: naicsCode })),
    )
  }

  if (pscCodes.length > 0) {
    await supabase.from('psc_codes').upsert(pscCodes.map((code) => ({ code })), { onConflict: 'code' })
    await supabase.from('watchlist_psc').insert(
      pscCodes.map((pscCode) => ({ watchlist_id: watchlist.id, psc_code: pscCode })),
    )
  }

  if (exclusions.length > 0) {
    await supabase.from('watchlist_exclusions').insert(
      exclusions.map((exclusion) => ({ watchlist_id: watchlist.id, exclusion })),
    )
  }

  redirect('/watchlists?message=Watchlist%20saved')
}

export async function deleteWatchlist(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/watchlists?error=Supabase%20is%20not%20configured')
  }

  const watchlistId = String(formData.get('watchlistId') ?? '')

  if (!watchlistId) {
    redirect('/watchlists?error=Watchlist%20not%20found')
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

  const { error } = await supabase.from('watchlists').delete().eq('id', watchlistId).eq('company_id', company.id)

  if (error) {
    redirect(`/watchlists?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/watchlists?message=Watchlist%20deleted')
}