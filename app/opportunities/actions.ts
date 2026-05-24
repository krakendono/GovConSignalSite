'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { fetchSamGovOpportunities } from '@/lib/samgov'
import { logAuditAction } from '@/lib/audit'

function scoreMatch(input: { title: string; synopsis: string | null; naicsCode: string | null }, keywords: string[], naicsCodes: string[]) {
  const reasons: string[] = []
  let score = 0

  const naicsSet = new Set(naicsCodes.map((code) => code.toUpperCase()))
  const keywordSet = Array.from(new Set(keywords.map((keyword) => keyword.toLowerCase())))

  if (input.naicsCode && naicsSet.has(input.naicsCode.toUpperCase())) {
    score += 50
    reasons.push(`NAICS match: ${input.naicsCode}`)
  }

  const haystack = `${input.title} ${input.synopsis ?? ''}`.toLowerCase()
  keywordSet.forEach((keyword) => {
    if (keyword && haystack.includes(keyword)) {
      score += 10
      reasons.push(`Keyword: ${keyword}`)
    }
  })

  if (score > 100) {
    score = 100
  }

  return { score, reasons }
}

export async function syncOpportunities() {
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
    redirect('/opportunities?error=Temporary%20session%20is%20read-only.%20Sign%20in%20to%20sync%20opportunities')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const [companyNaicsResult, watchlistKeywordsResult, watchlistNaicsResult] = await Promise.all([
    supabase.from('company_naics_codes').select('naics_code').eq('company_id', company.id),
    supabase
      .from('watchlist_keywords')
      .select('keyword, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
    supabase
      .from('watchlist_naics')
      .select('naics_code, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
  ])

  const companyNaics = (companyNaicsResult.data ?? []).map((row) => row.naics_code)
  const watchlistKeywords = (watchlistKeywordsResult.data ?? []).map((row) => row.keyword)
  const watchlistNaics = (watchlistNaicsResult.data ?? []).map((row) => row.naics_code)

  const allKeywords = Array.from(new Set(watchlistKeywords))
  const allNaics = Array.from(new Set([...companyNaics, ...watchlistNaics]))

  let opportunities
  try {
    opportunities = await fetchSamGovOpportunities(75)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SAM.gov sync failed'
    redirect(`/opportunities?error=${encodeURIComponent(message)}`)
  }

  if (opportunities.length === 0) {
    redirect('/opportunities?message=No%20opportunities%20returned%20from%20SAM.gov')
  }

  const upsertRows = opportunities.map((record) => ({
    source_notice_id: record.sourceNoticeId,
    source: 'sam.gov',
    title: record.title,
    synopsis: record.synopsis,
    agency: record.agency,
    naics_code: record.naicsCode,
    psc_code: record.pscCode,
    posted_at: record.postedAt,
    response_deadline_at: record.responseDeadlineAt,
    notice_url: record.noticeUrl,
    raw_payload: record.rawPayload,
  }))

  const { data: storedRows, error: upsertError } = await supabase
    .from('opportunities')
    .upsert(upsertRows, { onConflict: 'source_notice_id' })
    .select('id, source_notice_id, title, synopsis, naics_code')

  if (upsertError) {
    redirect(`/opportunities?error=${encodeURIComponent(upsertError.message)}`)
  }

  const byNoticeId = new Map((storedRows ?? []).map((row) => [row.source_notice_id, row]))

  const matchRows = opportunities
    .map((record) => {
      const stored = byNoticeId.get(record.sourceNoticeId)
      if (!stored) {
        return null
      }

      const { score, reasons } = scoreMatch(
        {
          title: stored.title,
          synopsis: stored.synopsis,
          naicsCode: stored.naics_code,
        },
        allKeywords,
        allNaics,
      )

      if (score <= 0) {
        return null
      }

      return {
        company_id: company.id,
        opportunity_id: stored.id,
        match_score: score,
        match_reason: reasons,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (matchRows.length > 0) {
    const { error: matchError } = await supabase
      .from('opportunity_matches')
      .upsert(matchRows, { onConflict: 'company_id,opportunity_id' })

    if (matchError) {
      redirect(`/opportunities?error=${encodeURIComponent(matchError.message)}`)
    }
  }

  await logAuditAction({
    actorUserId: user.id,
    action: 'opportunities.sync_completed',
    entityType: 'company',
    entityId: company.id,
    metadata: {
      fetchedCount: opportunities.length,
      matchedCount: matchRows.length,
    },
  })

  redirect(
    `/opportunities?message=${encodeURIComponent(
      `Synced ${opportunities.length} opportunities. ${matchRows.length} matched your filters.`,
    )}`,
  )
}
