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
  } | {
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

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Opportunities</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">SAM.gov Opportunity Feed</h1>
        <p className="mt-3 text-slate-700">
          Sync opportunities and review matches based on your company profile and watchlists.
        </p>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
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
              <p className="text-sm text-slate-600">
                No matches yet. Run a sync to ingest SAM.gov opportunities and generate basic matches.
              </p>
            ) : (
              matches.map((row) => {
                const opportunity = row.opportunities
                return (
                  <article key={opportunity.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium text-ink">{opportunity.title}</h3>
                        <p className="text-sm text-slate-600">{opportunity.agency ?? 'Agency not provided'}</p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
                        Match {row.match_score.toFixed(0)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-700">{opportunity.synopsis ?? 'No synopsis provided.'}</p>

                    <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                      <p>Notice ID: {opportunity.source_notice_id}</p>
                      <p>NAICS: {opportunity.naics_code ?? 'N/A'}</p>
                      <p>PSC: {opportunity.psc_code ?? 'N/A'}</p>
                      <p>Posted: {formatDate(opportunity.posted_at)}</p>
                      <p>Response due: {formatDate(opportunity.response_deadline_at)}</p>
                    </div>

                    {row.match_reason.length > 0 ? (
                      <p className="mt-3 text-xs text-slate-600">Reasons: {row.match_reason.join(', ')}</p>
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
