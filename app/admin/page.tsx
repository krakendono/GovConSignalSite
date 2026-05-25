import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/env'
import { canAccessAdmin, isLocalAdminBypassEnabled } from '@/lib/admin'
import { updateUserAccountStatus } from '@/app/admin/actions'

type AdminPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
    q?: string
  }>
}

type PublicUser = {
  id: string
  created_at: string
  primary_company_id: string | null
}

type Company = {
  id: string
  name: string
  owner_user_id: string
}

type UserStatus = {
  user_id: string
  account_status: 'active' | 'restricted'
  notes: string | null
  updated_at: string
}

type Watchlist = {
  id: string
  company_id: string
  name: string
  is_active: boolean
  created_at: string
}

type WatchlistKeyword = {
  watchlist_id: string
  keyword: string
}

type WatchlistNaics = {
  watchlist_id: string
  naics_code: string
}

type WatchlistPsc = {
  watchlist_id: string
  psc_code: string
}

type WatchlistExclusion = {
  watchlist_id: string
  exclusion: string
}

type CompanyNaics = {
  company_id: string
  naics_code: string
}

type OpportunityMatch = {
  company_id: string
  match_score: number
  match_reason: string[]
  created_at: string
  opportunities:
    | {
        id: string
        title: string
        source_notice_id: string
        agency: string | null
        notice_url: string | null
        posted_at: string | null
        response_deadline_at: string | null
      }
    | {
        id: string
        title: string
        source_notice_id: string
        agency: string | null
        notice_url: string | null
        posted_at: string | null
        response_deadline_at: string | null
      }[]
}

type AuditLog = {
  id: string
  actor_user_id: string | null
  target_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error
  const searchQuery = (params?.q ?? '').trim()
  const normalizedSearchQuery = searchQuery.toLowerCase()

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

  if (!canAccessAdmin(user.email)) {
    redirect('/dashboard?error=Admin%20access%20required')
  }

  const localBypassEnabled = isLocalAdminBypassEnabled()

  const adminClient = createSupabaseAdminClient()

  const [
    usersResult,
    companiesResult,
    statusesResult,
    logsResult,
    watchlistsResult,
    watchlistKeywordsResult,
    watchlistNaicsResult,
    watchlistPscResult,
    watchlistExclusionsResult,
    companyNaicsResult,
    opportunityMatchesResult,
  ] = await Promise.all([
    adminClient.from('users').select('id, created_at, primary_company_id').order('created_at', { ascending: false }),
    adminClient.from('companies').select('id, name, owner_user_id'),
    adminClient.from('admin_user_status').select('user_id, account_status, notes, updated_at'),
    adminClient
      .from('audit_logs')
      .select('id, actor_user_id, target_user_id, action, entity_type, entity_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('watchlists')
      .select('id, company_id, name, is_active, created_at')
      .order('created_at', { ascending: false }),
    adminClient.from('watchlist_keywords').select('watchlist_id, keyword'),
    adminClient.from('watchlist_naics').select('watchlist_id, naics_code'),
    adminClient.from('watchlist_psc').select('watchlist_id, psc_code'),
    adminClient.from('watchlist_exclusions').select('watchlist_id, exclusion'),
    adminClient.from('company_naics_codes').select('company_id, naics_code'),
    adminClient
      .from('opportunity_matches')
      .select(
        'company_id, match_score, match_reason, created_at, opportunities!inner(id, title, source_notice_id, agency, notice_url, posted_at, response_deadline_at)',
      )
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  const users = (usersResult.data ?? []) as PublicUser[]
  const companies = (companiesResult.data ?? []) as Company[]
  const statuses = (statusesResult.data ?? []) as UserStatus[]
  const logs = (logsResult.data ?? []) as AuditLog[]
  const watchlists = (watchlistsResult.data ?? []) as Watchlist[]
  const watchlistKeywords = (watchlistKeywordsResult.data ?? []) as WatchlistKeyword[]
  const watchlistNaics = (watchlistNaicsResult.data ?? []) as WatchlistNaics[]
  const watchlistPsc = (watchlistPscResult.data ?? []) as WatchlistPsc[]
  const watchlistExclusions = (watchlistExclusionsResult.data ?? []) as WatchlistExclusion[]
  const companyNaics = (companyNaicsResult.data ?? []) as CompanyNaics[]
  const opportunityMatchesRaw = (opportunityMatchesResult.data ?? []) as OpportunityMatch[]

  const companyByOwner = new Map<string, Company>()
  companies.forEach((company) => {
    companyByOwner.set(company.owner_user_id, company)
  })

  const statusByUser = new Map<string, UserStatus>()
  statuses.forEach((status) => {
    statusByUser.set(status.user_id, status)
  })

  const watchlistsByCompany = new Map<string, Watchlist[]>()
  const watchlistCompanyById = new Map<string, string>()
  watchlists.forEach((watchlist) => {
    const existing = watchlistsByCompany.get(watchlist.company_id) ?? []
    existing.push(watchlist)
    watchlistsByCompany.set(watchlist.company_id, existing)
    watchlistCompanyById.set(watchlist.id, watchlist.company_id)
  })

  const keywordsByWatchlist = new Map<string, string[]>()
  watchlistKeywords.forEach((row) => {
    const existing = keywordsByWatchlist.get(row.watchlist_id) ?? []
    existing.push(row.keyword)
    keywordsByWatchlist.set(row.watchlist_id, existing)
  })

  const naicsByWatchlist = new Map<string, string[]>()
  watchlistNaics.forEach((row) => {
    const existing = naicsByWatchlist.get(row.watchlist_id) ?? []
    existing.push(row.naics_code)
    naicsByWatchlist.set(row.watchlist_id, existing)
  })

  const targetedNaicsByCompany = new Map<string, Set<string>>()
  companyNaics.forEach((row) => {
    const existing = targetedNaicsByCompany.get(row.company_id) ?? new Set<string>()
    existing.add(row.naics_code)
    targetedNaicsByCompany.set(row.company_id, existing)
  })

  watchlistNaics.forEach((row) => {
    const companyId = watchlistCompanyById.get(row.watchlist_id)
    if (!companyId) {
      return
    }

    const existing = targetedNaicsByCompany.get(companyId) ?? new Set<string>()
    existing.add(row.naics_code)
    targetedNaicsByCompany.set(companyId, existing)
  })

  const pscByWatchlist = new Map<string, string[]>()
  watchlistPsc.forEach((row) => {
    const existing = pscByWatchlist.get(row.watchlist_id) ?? []
    existing.push(row.psc_code)
    pscByWatchlist.set(row.watchlist_id, existing)
  })

  const exclusionsByWatchlist = new Map<string, string[]>()
  watchlistExclusions.forEach((row) => {
    const existing = exclusionsByWatchlist.get(row.watchlist_id) ?? []
    existing.push(row.exclusion)
    exclusionsByWatchlist.set(row.watchlist_id, existing)
  })

  const opportunityMatches = opportunityMatchesRaw
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
      (row): row is Omit<OpportunityMatch, 'opportunities'> & {
        opportunities: {
          id: string
          title: string
          source_notice_id: string
          agency: string | null
          notice_url: string | null
          posted_at: string | null
          response_deadline_at: string | null
        }
      } => Boolean(row),
    )

  const matchesByCompany = new Map<string, typeof opportunityMatches>()
  opportunityMatches.forEach((match) => {
    const existing = matchesByCompany.get(match.company_id) ?? []
    existing.push(match)
    matchesByCompany.set(match.company_id, existing)
  })

  const filteredUsers = users.filter((record) => {
    if (!normalizedSearchQuery) {
      return true
    }

    const company = companyByOwner.get(record.id)
    const companyName = company?.name ?? ''
    const naicsCodes = company ? Array.from(targetedNaicsByCompany.get(company.id) ?? new Set<string>()) : []

    const searchableParts = [record.id, companyName, ...naicsCodes].map((value) => value.toLowerCase())
    return searchableParts.some((value) => value.includes(normalizedSearchQuery))
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Admin</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Account and Activity Management</h1>
        <p className="mt-3 text-slate-700">
          Review users and recent actions. This section only stores operational metadata and never stores
          passwords or payment-card details.
        </p>
        {localBypassEnabled ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Local admin bypass is enabled. Disable ADMIN_DEV_BYPASS outside local development.
          </p>
        ) : null}

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

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Users</h2>
            <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={searchQuery}
                placeholder="Search by user ID, company name, or NAICS"
                className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Search
              </button>
              {searchQuery ? (
                <a
                  href="/admin"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  Clear
                </a>
              ) : null}
            </form>
            <p className="mt-3 text-xs text-slate-600">
              Showing {filteredUsers.length} of {users.length} users.
            </p>
            <div className="mt-4 space-y-4">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-slate-600">No users found for this search.</p>
              ) : (
                filteredUsers.map((record) => {
                  const company = companyByOwner.get(record.id)
                  const status = statusByUser.get(record.id)
                  const companyWatchlists = company ? (watchlistsByCompany.get(company.id) ?? []) : []
                  const companyMatches = company ? (matchesByCompany.get(company.id) ?? []) : []
                  const targetedNaics = company
                    ? Array.from(targetedNaicsByCompany.get(company.id) ?? new Set<string>()).sort()
                    : []

                  return (
                    <details key={record.id} className="rounded-xl border border-slate-200 p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-500">User ID</p>
                            <p className="break-all text-sm font-medium text-ink">{record.id}</p>
                            <p className="mt-1 text-sm text-slate-700">Company: {company?.name ?? 'No company yet'}</p>
                            <p className="text-sm text-slate-700">
                              Status: <span className="font-medium">{status?.account_status ?? 'active'}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Created</p>
                            <p className="text-sm text-slate-700">{formatDate(record.created_at)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {companyWatchlists.length} watchlists, {companyMatches.length} matched contracts
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          Targeted NAICS: {targetedNaics.length > 0 ? targetedNaics.join(', ') : 'None'}
                        </p>
                      </summary>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-800">Watchlists</p>
                        {companyWatchlists.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-600">No watchlists for this user yet.</p>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {companyWatchlists.map((watchlist) => {
                              const keywords = keywordsByWatchlist.get(watchlist.id) ?? []
                              const naicsCodes = naicsByWatchlist.get(watchlist.id) ?? []
                              const pscCodes = pscByWatchlist.get(watchlist.id) ?? []
                              const exclusions = exclusionsByWatchlist.get(watchlist.id) ?? []

                              return (
                                <details key={watchlist.id} className="rounded-lg border border-slate-200 bg-white p-2">
                                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                                    {watchlist.name} ({watchlist.is_active ? 'active' : 'inactive'})
                                  </summary>
                                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                                    <p>Created: {formatDate(watchlist.created_at)}</p>
                                    <p>Keywords: {keywords.length > 0 ? keywords.join(', ') : 'None'}</p>
                                    <p>NAICS: {naicsCodes.length > 0 ? naicsCodes.join(', ') : 'None'}</p>
                                    <p>PSC: {pscCodes.length > 0 ? pscCodes.join(', ') : 'None'}</p>
                                    <p>Exclusions: {exclusions.length > 0 ? exclusions.join(', ') : 'None'}</p>
                                  </div>
                                </details>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-800">Contracts received (matched opportunities)</p>
                        {companyMatches.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-600">No matched opportunities recorded for this user yet.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {companyMatches.slice(0, 20).map((match) => (
                              <details
                                key={`${match.company_id}:${match.opportunities.id}:${match.created_at}`}
                                className="rounded-lg border border-slate-200 bg-white p-2"
                              >
                                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                                  {match.opportunities.title} (score {match.match_score.toFixed(0)})
                                </summary>
                                <div className="mt-2 space-y-1 text-xs text-slate-600">
                                  <p>Notice ID: {match.opportunities.source_notice_id}</p>
                                  <p>Agency: {match.opportunities.agency ?? 'N/A'}</p>
                                  <p>Matched at: {formatDate(match.created_at)}</p>
                                  <p>Posted: {match.opportunities.posted_at ? formatDate(match.opportunities.posted_at) : 'N/A'}</p>
                                  <p>
                                    Response due:{' '}
                                    {match.opportunities.response_deadline_at
                                      ? formatDate(match.opportunities.response_deadline_at)
                                      : 'N/A'}
                                  </p>
                                  {(() => {
                                    const breakdown = toDetailedBreakdown(match.match_reason, match.match_score)
                                    return breakdown.length > 0 ? (
                                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Score breakdown</p>
                                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-700">
                                          {breakdown.map((reason) => (
                                            <li key={`${match.company_id}:${match.opportunities.id}:${reason}`}>{reason}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : (
                                      <p>Score breakdown not available.</p>
                                    )
                                  })()}
                                  {match.opportunities.notice_url ? (
                                    <a
                                      href={match.opportunities.notice_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-signal hover:underline"
                                    >
                                      Open notice
                                    </a>
                                  ) : null}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>

                      <form action={updateUserAccountStatus} className="mt-4 space-y-2">
                        <input type="hidden" name="targetUserId" value={record.id} />
                        <select
                          name="accountStatus"
                          defaultValue={status?.account_status ?? 'active'}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        >
                          <option value="active">active</option>
                          <option value="restricted">restricted</option>
                        </select>
                        <textarea
                          name="notes"
                          defaultValue={status?.notes ?? ''}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Admin notes (no secrets)"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          Save status
                        </button>
                      </form>
                    </details>
                  )
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Recent actions</h2>
            <div className="mt-4 space-y-3">
              {logs.length === 0 ? (
                <p className="text-sm text-slate-600">No actions recorded yet.</p>
              ) : (
                logs.map((log) => (
                  <article key={log.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-ink">{log.action}</p>
                    <p className="text-xs text-slate-500">{formatDate(log.created_at)}</p>
                    <p className="mt-1 break-all text-xs text-slate-600">Actor: {log.actor_user_id ?? 'system'}</p>
                    {log.target_user_id ? (
                      <p className="break-all text-xs text-slate-600">Target: {log.target_user_id}</p>
                    ) : null}
                    {log.entity_type || log.entity_id ? (
                      <p className="break-all text-xs text-slate-600">
                        Entity: {[log.entity_type, log.entity_id].filter(Boolean).join(':')}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}



