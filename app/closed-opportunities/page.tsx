import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { setOpportunityStatus } from '@/app/opportunity-status/actions'

type ClosedOpportunitiesPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

type PipelineRow = {
  opportunity_id: string
  updated_at: string
  opportunities:
    | {
        id: string
        source_notice_id: string
        title: string
        agency: string | null
        naics_code: string | null
        psc_code: string | null
        response_deadline_at: string | null
        notice_url: string | null
      }
    | {
        id: string
        source_notice_id: string
        title: string
        agency: string | null
        naics_code: string | null
        psc_code: string | null
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

export default async function ClosedOpportunitiesPage({ searchParams }: ClosedOpportunitiesPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error

  if (!isSupabaseConfigured()) {
    redirect('/auth/login')
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

  const { data: result } = await supabase
    .from('company_opportunity_statuses')
    .select(
      'opportunity_id, updated_at, opportunities!inner(id, source_notice_id, title, agency, naics_code, psc_code, response_deadline_at, notice_url)',
    )
    .eq('company_id', company.id)
    .eq('status', 'closed')
    .order('updated_at', { ascending: false })

  const rows = ((result ?? []) as PipelineRow[])
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
      (row): row is Omit<PipelineRow, 'opportunities'> & {
        opportunities: {
          id: string
          source_notice_id: string
          title: string
          agency: string | null
          naics_code: string | null
          psc_code: string | null
          response_deadline_at: string | null
          notice_url: string | null
        }
      } => Boolean(row),
    )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Pipeline</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Closed Opportunities</h1>
        <p className="mt-3 text-slate-700">Opportunities marked as no longer active for your team.</p>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Open opportunities</Link>
          <Link href="/active-opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Active opportunities</Link>
          <Link href="/taken-opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Taken opportunities</Link>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">No closed opportunities yet.</p>
          ) : (
            <div className="space-y-4">
              {rows.map((row) => (
                <article key={row.opportunity_id} className="rounded-xl border border-slate-200 p-4">
                  <h2 className="text-lg font-semibold text-ink">{row.opportunities.title}</h2>
                  <p className="text-sm text-slate-600">{row.opportunities.agency ?? 'Agency not provided'}</p>
                  <p className="mt-2 text-xs text-slate-600">Why here: Closed opportunities are the ones no longer being pursued.</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p>Notice ID: {row.opportunities.source_notice_id}</p>
                    <p>Response due: {formatDate(row.opportunities.response_deadline_at)}</p>
                    <p>NAICS: {row.opportunities.naics_code ?? 'N/A'}</p>
                    <p>PSC: {row.opportunities.psc_code ?? 'N/A'}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={setOpportunityStatus}>
                      <input type="hidden" name="opportunityId" value={row.opportunity_id} />
                      <input type="hidden" name="status" value="active" />
                      <input type="hidden" name="returnTo" value="/closed-opportunities" />
                      <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50">Reopen as active</button>
                    </form>
                    <form action={setOpportunityStatus}>
                      <input type="hidden" name="opportunityId" value={row.opportunity_id} />
                      <input type="hidden" name="status" value="taken" />
                      <input type="hidden" name="returnTo" value="/closed-opportunities" />
                      <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">Mark taken</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
