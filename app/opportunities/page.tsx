import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { syncOpportunities } from '@/app/opportunities/actions'

type OpportunitiesPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

type MatchRow = {
  match_score: number
  match_reason: string[]
  opportunities:
    | {
        id: string
        source_notice_id: string
        title: string
        synopsis: string | null
        agency: string | null
        naics_code: string | null
        psc_code: string | null
        posted_at: string | null
        response_deadline_at: string | null
        notice_url: string | null
      }
    | {
        id: string
        source_notice_id: string
        title: string
        synopsis: string | null
        agency: string | null
        naics_code: string | null
        psc_code: string | null
        posted_at: string | null
        response_deadline_at: string | null
        notice_url: string | null
      }[]
}

type OpportunityRow = {
  id: string
  source_notice_id: string
  title: string
  synopsis: string | null
  agency: string | null
  naics_code: string | null
  psc_code: string | null
  posted_at: string | null
  response_deadline_at: string | null
  notice_url: string | null
}

type OpportunitySummaryRow = {
  opportunity_id: string
  summary_text: string
  key_points: string[]
  pursue_steps: string[]
}

function formatDate(value: string | null) {
  if (!value) {
    return 'N/A'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString()
}

function toDetailedBreakdown(reasons: string[], matchScore: number) {
  const alreadyDetailed = reasons.some((reason) => reason.startsWith('Final score:') || reason.startsWith('NAICS:'))
  if (alreadyDetailed) {
    return reasons
  }

  const lowerReasons = reasons.map((reason) => reason.toLowerCase())

  const naicsRaw = reasons.find((reason) => reason.toLowerCase().includes('naics match'))
  const pscRaw = reasons.find((reason) => reason.toLowerCase().includes('psc match'))
  const keywordRaw = reasons.filter((reason) => reason.toLowerCase().includes('keyword'))
  const preferredAgencyRaw = reasons.find((reason) => reason.toLowerCase().includes('preferred agency'))
  const exclusionRaw = reasons.find((reason) => reason.toLowerCase().includes('excluded'))

  const naicsMatchedCode = naicsRaw?.split(':').slice(1).join(':').trim()
  const pscMatchedCode = pscRaw?.split(':').slice(1).join(':').trim()

  let keywordPoints = 0
  keywordRaw.forEach((reason) => {
    const lowered = reason.toLowerCase()
    if (lowered.includes('title')) {
      keywordPoints += 10
      return
    }
    if (lowered.includes('synopsis')) {
      keywordPoints += 6
      return
    }
    keywordPoints += 10
  })
  keywordPoints = Math.min(keywordPoints, 30)

  const fallback = [
    naicsRaw
      ? `NAICS: +40 (matched ${naicsMatchedCode ?? 'configured code'})`
      : 'NAICS: +0 (no code match)',
    pscRaw
      ? `PSC: +25 (matched ${pscMatchedCode ?? 'configured code'})`
      : 'PSC: +0 (no code match)',
    keywordRaw.length > 0
      ? `Keywords: +${keywordPoints} (${keywordRaw.join(' | ')})`
      : 'Keywords: +0 (no keyword hit)',
    preferredAgencyRaw
      ? 'Preferred agency: +12 (matched preferred agency)'
      : 'Preferred agency: +0 (no preferred agency hit)',
    exclusionRaw
      ? 'Exclusions: -35 (contains excluded term)'
      : 'Exclusions: +0 (no exclusion hit)',
    `Final score: ${matchScore.toFixed(0)}/100`,
  ]

  const hasSignal = lowerReasons.some(
    (reason) =>
      reason.includes('naics') ||
      reason.includes('psc') ||
      reason.includes('keyword') ||
      reason.includes('preferred agency') ||
      reason.includes('excluded'),
  )

  return hasSignal ? fallback : ['Scoring details unavailable for this older match record.', `Final score: ${matchScore.toFixed(0)}/100`]
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error

  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.is_anonymous) {
    redirect('/dashboard?error=Sign%20in%20to%20access%20opportunity%20sync')
  }

  const { data: company } = await supabase.from('companies').select('id').eq('owner_user_id', user.id).maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const { data: matchesResult } = await supabase
    .from('opportunity_matches')
    .select(
      'match_score, match_reason, opportunities!inner(id, source_notice_id, title, synopsis, agency, naics_code, psc_code, posted_at, response_deadline_at, notice_url)',
    )
    .eq('company_id', company.id)
    .order('match_score', { ascending: false })
    .limit(100)

  const matches = ((matchesResult ?? []) as MatchRow[])
    .map((row) => {
      const opportunity = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities
      if (!opportunity) {
        return null
      }

      return {
        ...row,
        opportunities: opportunity,
      }
    })
    .filter(
      (row): row is Omit<MatchRow, 'opportunities'> & {
        opportunities: {
          id: string
          source_notice_id: string
          title: string
          synopsis: string | null
          agency: string | null
          naics_code: string | null
          psc_code: string | null
          posted_at: string | null
          response_deadline_at: string | null
          notice_url: string | null
        }
      } => Boolean(row),
    )

  const matchByOpportunityId = new Map(
    matches.map((row) => [
      row.opportunities.id,
      {
        matchScore: row.match_score,
        reasons: row.match_reason,
      },
    ]),
  )

  const { data: allOpportunitiesResult } = await supabase
    .from('opportunities')
    .select('id, source_notice_id, title, synopsis, agency, naics_code, psc_code, posted_at, response_deadline_at, notice_url')
    .order('posted_at', { ascending: false })
    .limit(100)

  const allOpportunities = (allOpportunitiesResult ?? []) as OpportunityRow[]
  const allOpportunityIds = allOpportunities.map((row) => row.id)

  let summaries: OpportunitySummaryRow[] = []
  if (allOpportunityIds.length > 0) {
    const { data: summariesResult } = await supabase
      .from('opportunity_summaries')
      .select('opportunity_id, summary_text, key_points, pursue_steps')
      .in('opportunity_id', allOpportunityIds)

    summaries = (summariesResult ?? []) as OpportunitySummaryRow[]
  }

  const summaryByOpportunityId = new Map(summaries.map((summary) => [summary.opportunity_id, summary]))

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Opportunities</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">SAM.gov Opportunity Feed</h1>
        <p className="mt-3 text-slate-700">Sync opportunities and review matches based on your company profile and watchlists.</p>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <form action={syncOpportunities}>
            <button
              type="submit"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Sync opportunities from SAM.gov
            </button>
          </form>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Matched opportunities</h2>
          <div className="mt-5 space-y-4">
            {matches.length === 0 ? (
              <p className="text-sm text-slate-600">No matches yet. Run a sync to ingest SAM.gov opportunities and generate basic matches.</p>
            ) : (
              matches.map((row) => {
                const opportunity = row.opportunities
                const summary = summaryByOpportunityId.get(opportunity.id)
                const breakdown = toDetailedBreakdown(row.match_reason, row.match_score)

                return (
                  <article key={opportunity.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium text-ink">{opportunity.title}</h3>
                        <p className="text-sm text-slate-600">{opportunity.agency ?? 'Agency not provided'}</p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">Match {row.match_score.toFixed(0)}</span>
                    </div>

                    <p className="mt-3 text-sm text-slate-700">{summary?.summary_text ?? opportunity.synopsis ?? 'No synopsis provided.'}</p>

                    <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                      <p>Notice ID: {opportunity.source_notice_id}</p>
                      <p>NAICS: {opportunity.naics_code ?? 'N/A'}</p>
                      <p>PSC: {opportunity.psc_code ?? 'N/A'}</p>
                      <p>Posted: {formatDate(opportunity.posted_at)}</p>
                      <p>Response due: {formatDate(opportunity.response_deadline_at)}</p>
                    </div>

                    {summary && summary.key_points.length > 0 ? (
                      <p className="mt-3 text-xs text-slate-600">Key points: {summary.key_points.join(' | ')}</p>
                    ) : null}

                    {breakdown.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Score breakdown</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
                          {breakdown.map((reason) => (
                            <li key={`${opportunity.id}-${reason}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {opportunity.notice_url ? (
                      <a
                        href={opportunity.notice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-signal hover:underline"
                      >
                        Open notice
                      </a>
                    ) : null}
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">All synced opportunities</h2>
          <p className="mt-2 text-sm text-slate-700">
            Review the broader feed, including notices that did not match your current company profile or watchlists.
          </p>
          <div className="mt-5 space-y-4">
            {allOpportunities.length === 0 ? (
              <p className="text-sm text-slate-600">No synced opportunities are stored yet. Run a sync first.</p>
            ) : (
              allOpportunities.map((opportunity) => {
                const match = matchByOpportunityId.get(opportunity.id)
                const summary = summaryByOpportunityId.get(opportunity.id)
                const breakdown = match ? toDetailedBreakdown(match.reasons, match.matchScore) : []

                return (
                  <article key={opportunity.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium text-ink">{opportunity.title}</h3>
                        <p className="text-sm text-slate-600">{opportunity.agency ?? 'Agency not provided'}</p>
                      </div>
                      <span
                        className={
                          match
                            ? 'rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent'
                            : 'rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700'
                        }
                      >
                        {match ? `Matched ${match.matchScore.toFixed(0)}` : 'Manual review'}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-700">{summary?.summary_text ?? opportunity.synopsis ?? 'No synopsis provided.'}</p>

                    <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                      <p>Notice ID: {opportunity.source_notice_id}</p>
                      <p>NAICS: {opportunity.naics_code ?? 'N/A'}</p>
                      <p>PSC: {opportunity.psc_code ?? 'N/A'}</p>
                      <p>Posted: {formatDate(opportunity.posted_at)}</p>
                      <p>Response due: {formatDate(opportunity.response_deadline_at)}</p>
                    </div>

                    {summary && summary.key_points.length > 0 ? (
                      <p className="mt-3 text-xs text-slate-600">Key points: {summary.key_points.join(' | ')}</p>
                    ) : null}

                    {match ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Score breakdown</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
                          {breakdown.map((reason) => (
                            <li key={`${opportunity.id}-${reason}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-600">
                        Not matched to your current filters. Adjust company NAICS, PSC, agencies, keywords, or exclusions if you want similar notices surfaced automatically.
                      </p>
                    )}

                    {summary && summary.pursue_steps.length > 0 ? (
                      <p className="mt-2 text-xs text-slate-600">Pursue steps: {summary.pursue_steps.join(' | ')}</p>
                    ) : null}

                    {opportunity.notice_url ? (
                      <a
                        href={opportunity.notice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-signal hover:underline"
                      >
                        Open notice
                      </a>
                    ) : null}
                  </article>
                )
              })
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
