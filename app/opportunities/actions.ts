'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { fetchSamGovOpportunities } from '@/lib/samgov'
import { fetchContractAwardIntelligence } from '@/lib/contract-awards'
import { logAuditAction } from '@/lib/audit'
import { logUsageEvent } from '@/lib/usage-events'
import { generateOpportunitySummary } from '@/lib/opportunity-summary'

type MatchInput = {
  title: string
  synopsis: string | null
  agency: string | null
  naicsCode: string | null
  pscCode: string | null
}

type MatchCriteria = {
  naicsCodes: string[]
  pscCodes: string[]
  keywords: string[]
  preferredAgencies: string[]
  excludedTerms: string[]
}

type ExistingMatchRow = {
  opportunity_id: string
  match_score: number
}

type ExistingStatusRow = {
  opportunity_id: string
  status: 'active' | 'closed' | 'taken'
}

type OpportunityStatusRow = {
  company_id: string
  opportunity_id: string
  status: 'active' | 'closed'
}

type OpportunityAwardIntelligenceRow = {
  opportunity_id: string
  award_count: number
  incumbent_vendor: string | null
  last_award_date: string | null
  total_award_value: number | null
  rebid_signal: string
  summary_text: string
  source_payload: Record<string, unknown>[]
}

const HIGH_MATCH_THRESHOLD = 70

function toLowerUnique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)))
}

function toUpperUnique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean)))
}

function firstMatchedTerm(text: string, terms: string[]) {
  return terms.find((term) => term && text.includes(term)) ?? null
}

function scoreMatch(input: MatchInput, criteria: MatchCriteria) {
  const reasons: string[] = []

  const titleText = input.title.toLowerCase()
  const synopsisText = (input.synopsis ?? '').toLowerCase()
  const haystack = `${titleText} ${synopsisText}`
  const agencyText = (input.agency ?? '').toLowerCase()

  const naicsSet = new Set(toUpperUnique(criteria.naicsCodes))
  const pscSet = new Set(toUpperUnique(criteria.pscCodes))
  const keywordSet = toLowerUnique(criteria.keywords)
  const preferredAgencySet = toLowerUnique(criteria.preferredAgencies)
  const exclusionSet = toLowerUnique(criteria.excludedTerms)

  const naicsMatched = Boolean(input.naicsCode && naicsSet.has(input.naicsCode.toUpperCase()))
  const naicsPoints = naicsMatched ? 40 : 0
  reasons.push(naicsMatched ? `NAICS: +40 (matched ${input.naicsCode})` : 'NAICS: +0 (no code match)')

  const pscMatched = Boolean(input.pscCode && pscSet.has(input.pscCode.toUpperCase()))
  const pscPoints = pscMatched ? 25 : 0
  reasons.push(pscMatched ? `PSC: +25 (matched ${input.pscCode})` : 'PSC: +0 (no code match)')

  let keywordPoints = 0
  const titleHits: string[] = []
  const synopsisHits: string[] = []

  keywordSet.forEach((keyword) => {
    if (!keyword) {
      return
    }

    if (titleText.includes(keyword)) {
      keywordPoints += 10
      titleHits.push(keyword)
      return
    }

    if (synopsisText.includes(keyword)) {
      keywordPoints += 6
      synopsisHits.push(keyword)
    }
  })

  keywordPoints = Math.min(keywordPoints, 30)
  if (keywordPoints > 0) {
    const hitSummary = [
      titleHits.length > 0 ? `title: ${titleHits.join(', ')}` : null,
      synopsisHits.length > 0 ? `synopsis: ${synopsisHits.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' | ')
    reasons.push(`Keywords: +${keywordPoints} (${hitSummary})`)
  } else {
    reasons.push('Keywords: +0 (no keyword hit)')
  }

  const matchedAgency = preferredAgencySet.length > 0 ? firstMatchedTerm(agencyText, preferredAgencySet) : null
  const preferredAgencyPoints = matchedAgency ? 12 : 0
  reasons.push(
    matchedAgency ? `Preferred agency: +12 (matched ${matchedAgency})` : 'Preferred agency: +0 (no preferred agency hit)',
  )

  const matchedExclusion = exclusionSet.length > 0 ? firstMatchedTerm(haystack, exclusionSet) : null
  const exclusionPoints = matchedExclusion ? -35 : 0
  reasons.push(
    matchedExclusion ? `Exclusions: -35 (contains ${matchedExclusion})` : 'Exclusions: +0 (no exclusion hit)',
  )

  const rawScore = naicsPoints + pscPoints + keywordPoints + preferredAgencyPoints + exclusionPoints
  const score = Math.max(0, Math.min(100, rawScore))
  reasons.push(`Final score: ${score}/100`)

  return { score, reasons }
}

function uniqueCodes(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function deriveAutomaticStatus(postedAt: string | null, responseDeadlineAt: string | null) {
  const now = Date.now()

  if (responseDeadlineAt) {
    const deadline = new Date(responseDeadlineAt)
    if (!Number.isNaN(deadline.getTime())) {
      if (deadline.getTime() < now) {
        return {
          status: 'closed' as const,
          reason: `Response deadline passed on ${deadline.toLocaleDateString()}`,
        }
      }

      return {
        status: 'active' as const,
        reason: `Response deadline is still open until ${deadline.toLocaleDateString()}`,
      }
    }
  }

  if (postedAt) {
    const posted = new Date(postedAt)
    if (!Number.isNaN(posted.getTime())) {
      return {
        status: 'active' as const,
        reason: `No response deadline available; posted ${posted.toLocaleDateString()} and treated as active while present in SAM.gov`,
      }
    }
  }

  return {
    status: 'active' as const,
    reason: 'No response deadline available; treated as active while present in SAM.gov',
  }
}

function deriveAutomaticStatusFromSam(record: {
  postedAt: string | null
  responseDeadlineAt: string | null
  archiveDate: string | null
}) {
  const now = Date.now()

  if (record.archiveDate) {
    const archived = new Date(record.archiveDate)
    if (!Number.isNaN(archived.getTime())) {
      if (archived.getTime() <= now) {
        return {
          status: 'closed' as const,
          reason: `SAM archive date reached on ${archived.toLocaleDateString()}`,
        }
      }

      return {
        status: 'active' as const,
        reason: `SAM archive date is set for ${archived.toLocaleDateString()}`,
      }
    }
  }

  if (record.responseDeadlineAt) {
    const deadline = new Date(record.responseDeadlineAt)
    if (!Number.isNaN(deadline.getTime())) {
      if (deadline.getTime() < now) {
        return {
          status: 'closed' as const,
          reason: `Response deadline passed on ${deadline.toLocaleDateString()}`,
        }
      }

      return {
        status: 'active' as const,
        reason: `Response deadline is still open until ${deadline.toLocaleDateString()}`,
      }
    }
  }

  if (record.postedAt) {
    const posted = new Date(record.postedAt)
    if (!Number.isNaN(posted.getTime())) {
      return {
        status: 'active' as const,
        reason: `No response deadline available; posted ${posted.toLocaleDateString()} and treated as active while present in SAM.gov`,
      }
    }
  }

  return {
    status: 'active' as const,
    reason: 'No response deadline available; treated as active while present in SAM.gov',
  }
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

  const [
    companyProfileResult,
    companyNaicsResult,
    companyPscResult,
    watchlistKeywordsResult,
    watchlistNaicsResult,
    watchlistPscResult,
    watchlistExclusionsResult,
  ] = await Promise.all([
    supabase
      .from('company_profiles')
      .select('keywords, preferred_agencies, excluded_industries')
      .eq('company_id', company.id)
      .maybeSingle(),
    supabase.from('company_naics_codes').select('naics_code').eq('company_id', company.id),
    supabase.from('company_psc_codes').select('psc_code').eq('company_id', company.id),
    supabase
      .from('watchlist_keywords')
      .select('keyword, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
    supabase
      .from('watchlist_naics')
      .select('naics_code, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
    supabase
      .from('watchlist_psc')
      .select('psc_code, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
    supabase
      .from('watchlist_exclusions')
      .select('exclusion, watchlist_id, watchlists!inner(company_id)')
      .eq('watchlists.company_id', company.id),
  ])

  const companyProfile = companyProfileResult.data
  const companyNaics = (companyNaicsResult.data ?? []).map((row) => row.naics_code)
  const companyPsc = (companyPscResult.data ?? []).map((row) => row.psc_code)
  const watchlistKeywords = (watchlistKeywordsResult.data ?? []).map((row) => row.keyword)
  const watchlistNaics = (watchlistNaicsResult.data ?? []).map((row) => row.naics_code)
  const watchlistPsc = (watchlistPscResult.data ?? []).map((row) => row.psc_code)
  const watchlistExclusions = (watchlistExclusionsResult.data ?? []).map((row) => row.exclusion)

  const criteria: MatchCriteria = {
    naicsCodes: Array.from(new Set([...companyNaics, ...watchlistNaics])),
    pscCodes: Array.from(new Set([...companyPsc, ...watchlistPsc])),
    keywords: Array.from(new Set([...safeStringArray(companyProfile?.keywords), ...watchlistKeywords])),
    preferredAgencies: safeStringArray(companyProfile?.preferred_agencies),
    excludedTerms: Array.from(new Set([...safeStringArray(companyProfile?.excluded_industries), ...watchlistExclusions])),
  }

  let opportunities
  const samPullStartedAt = Date.now()
  try {
    opportunities = await fetchSamGovOpportunities(75)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SAM.gov sync failed'
    await logUsageEvent({
      actorUserId: user.id,
      companyId: company.id,
      action: 'sam.api_pull',
      provider: 'sam.gov',
      model: null,
      status: 'error',
      durationMs: Date.now() - samPullStartedAt,
      metadata: {
        requestedLimit: 75,
        error: message,
      },
    })
    redirect(`/opportunities?error=${encodeURIComponent(message)}`)
  }

  await logUsageEvent({
    actorUserId: user.id,
    companyId: company.id,
    action: 'sam.api_pull',
    provider: 'sam.gov',
    model: null,
    status: 'success',
    durationMs: Date.now() - samPullStartedAt,
    metadata: {
      requestedLimit: 75,
      opportunitiesFetched: opportunities.length,
    },
  })

  if (opportunities.length === 0) {
    redirect('/opportunities?message=No%20opportunities%20returned%20from%20SAM.gov')
  }

  const naicsCodes = uniqueCodes(opportunities.map((record) => record.naicsCode))
  const pscCodes = uniqueCodes(opportunities.map((record) => record.pscCode))

  if (naicsCodes.length > 0) {
    const { error: naicsError } = await supabase
      .from('naics_codes')
      .upsert(naicsCodes.map((code) => ({ code })), { onConflict: 'code' })

    if (naicsError) {
      redirect(`/opportunities?error=${encodeURIComponent(naicsError.message)}`)
    }
  }

  if (pscCodes.length > 0) {
    const { error: pscError } = await supabase
      .from('psc_codes')
      .upsert(pscCodes.map((code) => ({ code })), { onConflict: 'code' })

    if (pscError) {
      redirect(`/opportunities?error=${encodeURIComponent(pscError.message)}`)
    }
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
    .select('id, source_notice_id, title, synopsis, agency, naics_code, psc_code, posted_at, response_deadline_at')

  if (upsertError) {
    redirect(`/opportunities?error=${encodeURIComponent(upsertError.message)}`)
  }

  const byNoticeId = new Map((storedRows ?? []).map((row) => [row.source_notice_id, row]))
  const storedByOpportunityId = new Map((storedRows ?? []).map((row) => [row.id, row]))
  const fetchedByNoticeId = new Map(opportunities.map((record) => [record.sourceNoticeId, record]))

  const summaryRows = (storedRows ?? [])
    .map((stored) => {
      const fetched = fetchedByNoticeId.get(stored.source_notice_id)
      if (!fetched) {
        return null
      }

      const summary = generateOpportunitySummary({
        title: fetched.title,
        synopsis: fetched.synopsis,
        agency: fetched.agency,
        naicsCode: fetched.naicsCode,
        pscCode: fetched.pscCode,
        postedAt: fetched.postedAt,
        responseDeadlineAt: fetched.responseDeadlineAt,
      })

      return {
        opportunity_id: stored.id,
        summary_text: summary.summaryText,
        key_points: summary.keyPoints,
        pursue_steps: summary.pursueSteps,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (summaryRows.length > 0) {
    const { error: summaryError } = await supabase
      .from('opportunity_summaries')
      .upsert(summaryRows, { onConflict: 'opportunity_id' })

    if (summaryError) {
      redirect(`/opportunities?error=${encodeURIComponent(summaryError.message)}`)
    }
  }

  const { data: existingMatchesResult } = await supabase
    .from('opportunity_matches')
    .select('opportunity_id, match_score')
    .eq('company_id', company.id)

  const storedOpportunityIds = (storedRows ?? []).map((row) => row.id)
  const { data: existingStatusesResult } = storedOpportunityIds.length
    ? await supabase
        .from('company_opportunity_statuses')
        .select('opportunity_id, status')
        .eq('company_id', company.id)
        .in('opportunity_id', storedOpportunityIds)
    : { data: [] as ExistingStatusRow[] }

  const existingMatchScoreByOpportunity = new Map(
    ((existingMatchesResult ?? []) as ExistingMatchRow[]).map((row) => [row.opportunity_id, Number(row.match_score)]),
  )
  const existingStatusByOpportunity = new Map(
    ((existingStatusesResult ?? []) as ExistingStatusRow[]).map((row) => [row.opportunity_id, row.status]),
  )

  const autoStatusRows = opportunities
    .map((record) => {
      const stored = byNoticeId.get(record.sourceNoticeId)
      if (!stored) {
        return null
      }

      const existingStatus = existingStatusByOpportunity.get(stored.id)
      if (existingStatus === 'taken') {
        return null
      }

      const automaticStatus = deriveAutomaticStatusFromSam({
        postedAt: fetchedByNoticeId.get(record.sourceNoticeId)?.postedAt ?? stored.posted_at,
        responseDeadlineAt: fetchedByNoticeId.get(record.sourceNoticeId)?.responseDeadlineAt ?? stored.response_deadline_at,
        archiveDate: fetchedByNoticeId.get(record.sourceNoticeId)?.archiveDate ?? null,
      })

      return {
        company_id: company.id,
        opportunity_id: stored.id,
        status: automaticStatus.status,
      }
    })
    .filter((row): row is OpportunityStatusRow => Boolean(row))

  if (autoStatusRows.length > 0) {
    const { error: statusError } = await supabase
      .from('company_opportunity_statuses')
      .upsert(autoStatusRows, { onConflict: 'company_id,opportunity_id' })

    if (statusError) {
      redirect(`/opportunities?error=${encodeURIComponent(statusError.message)}`)
    }
  }

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
          agency: stored.agency,
          naicsCode: stored.naics_code,
          pscCode: stored.psc_code,
        },
        criteria,
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

    const notificationRows = matchRows
      .map((match) => {
        const existingScore = existingMatchScoreByOpportunity.get(match.opportunity_id)
        const isNewMatch = existingScore === undefined
        const isHighNow = Number(match.match_score) >= HIGH_MATCH_THRESHOLD
        const wasHighBefore = existingScore !== undefined && existingScore >= HIGH_MATCH_THRESHOLD

        const opportunity = storedByOpportunityId.get(match.opportunity_id)
        if (!opportunity) {
          return []
        }

        const rows: Array<{
          company_id: string
          opportunity_id: string
          notification_type: 'new_match' | 'high_match'
          title: string
          body: string
          is_read: boolean
          metadata: Record<string, unknown>
        }> = []

        if (isNewMatch && !isHighNow) {
          rows.push({
            company_id: company.id,
            opportunity_id: match.opportunity_id,
            notification_type: 'new_match',
            title: 'New opportunity match',
            body: `${opportunity.title} matched your current profile/watchlists with score ${Number(match.match_score).toFixed(0)}.`,
            is_read: false,
            metadata: {
              score: Number(match.match_score),
              sourceNoticeId: opportunity.source_notice_id,
            },
          })
        }

        if (isHighNow && (isNewMatch || !wasHighBefore)) {
          rows.push({
            company_id: company.id,
            opportunity_id: match.opportunity_id,
            notification_type: 'high_match',
            title: 'High-value match alert',
            body: `${opportunity.title} reached score ${Number(match.match_score).toFixed(0)} (threshold ${HIGH_MATCH_THRESHOLD}).`,
            is_read: false,
            metadata: {
              score: Number(match.match_score),
              threshold: HIGH_MATCH_THRESHOLD,
              sourceNoticeId: opportunity.source_notice_id,
            },
          })
        }

        return rows
      })
      .flat()

    if (notificationRows.length > 0) {
      const { error: notificationError } = await supabase
        .from('watchlist_notifications')
        .upsert(notificationRows, { onConflict: 'company_id,opportunity_id,notification_type' })

      if (notificationError) {
        redirect(`/opportunities?error=${encodeURIComponent(notificationError.message)}`)
      }
    }
  }

  const awardIntelligenceRows = (
    await Promise.all(
      matchRows
        .sort((left, right) => right.match_score - left.match_score)
        .slice(0, 10)
        .map(async (match) => {
          const stored = storedByOpportunityId.get(match.opportunity_id)
          if (!stored) {
            return null
          }

          const intelligence = await fetchContractAwardIntelligence({
            title: stored.title,
            agency: stored.agency,
            naicsCode: stored.naics_code,
            pscCode: stored.psc_code,
          })

          if (!intelligence) {
            return null
          }

          return {
            opportunity_id: stored.id,
            award_count: intelligence.awardCount,
            incumbent_vendor: intelligence.incumbentVendor,
            last_award_date: intelligence.lastAwardDate,
            total_award_value: intelligence.totalAwardValue,
            rebid_signal: intelligence.rebidSignal,
            summary_text: intelligence.summaryText,
            source_payload: intelligence.sourceRecords.map((record) => record.rawPayload),
          }
        }),
    )
  ).filter((row): row is OpportunityAwardIntelligenceRow => Boolean(row))

  if (awardIntelligenceRows.length > 0) {
    const { error: awardError } = await supabase
      .from('opportunity_award_intelligence')
      .upsert(awardIntelligenceRows, { onConflict: 'opportunity_id' })

    if (awardError) {
      redirect(`/opportunities?error=${encodeURIComponent(awardError.message)}`)
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
      highThreshold: HIGH_MATCH_THRESHOLD,
      scoringSignals: {
        naicsCount: criteria.naicsCodes.length,
        pscCount: criteria.pscCodes.length,
        keywordCount: criteria.keywords.length,
        preferredAgencyCount: criteria.preferredAgencies.length,
        excludedTermCount: criteria.excludedTerms.length,
      },
    },
  })

  redirect(
    `/opportunities?message=${encodeURIComponent(
      `Synced ${opportunities.length} opportunities. ${matchRows.length} matched your filters.`,
    )}`,
  )
}
