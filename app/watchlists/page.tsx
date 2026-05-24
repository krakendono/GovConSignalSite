import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { deleteWatchlist, saveWatchlist } from '@/app/watchlists/actions'

type WatchlistsPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
    editId?: string
  }>
}

function toCsv(values: string[] | null | undefined) {
  return values && values.length > 0 ? values.join(', ') : ''
}

export default async function WatchlistsPage({ searchParams }: WatchlistsPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error
  const editId = params?.editId

  if (!isSupabaseConfigured()) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
        <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-ink">Configure Supabase first</h1>
          <p className="mt-3 text-sm text-slate-700">
            Add values to `.env.local` using `.env.example`, then restart the dev server.
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium text-signal hover:underline">
            Back to home
          </Link>
        </section>
      </main>
    )
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
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const { data: watchlists } = await supabase
    .from('watchlists')
    .select('id, name, is_active, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })

  const watchlistIds = (watchlists ?? []).map((item) => item.id)

  const editingWatchlist = editId
    ? (watchlists ?? []).find((watchlist) => watchlist.id === editId) ?? null
    : null

  const [keywordsResult, naicsResult, pscResult, exclusionsResult] = await Promise.all([
    watchlistIds.length > 0
      ? supabase.from('watchlist_keywords').select('watchlist_id, keyword').in('watchlist_id', watchlistIds)
      : Promise.resolve({ data: [] }),
    watchlistIds.length > 0
      ? supabase.from('watchlist_naics').select('watchlist_id, naics_code').in('watchlist_id', watchlistIds)
      : Promise.resolve({ data: [] }),
    watchlistIds.length > 0
      ? supabase.from('watchlist_psc').select('watchlist_id, psc_code').in('watchlist_id', watchlistIds)
      : Promise.resolve({ data: [] }),
    watchlistIds.length > 0
      ? supabase.from('watchlist_exclusions').select('watchlist_id, exclusion').in('watchlist_id', watchlistIds)
      : Promise.resolve({ data: [] }),
  ])

  const keywordMap = new Map<string, string[]>()
  ;(keywordsResult.data ?? []).forEach((row) => {
    const existing = keywordMap.get(row.watchlist_id) ?? []
    existing.push(row.keyword)
    keywordMap.set(row.watchlist_id, existing)
  })

  const naicsMap = new Map<string, string[]>()
  ;(naicsResult.data ?? []).forEach((row) => {
    const existing = naicsMap.get(row.watchlist_id) ?? []
    existing.push(row.naics_code)
    naicsMap.set(row.watchlist_id, existing)
  })

  const pscMap = new Map<string, string[]>()
  ;(pscResult.data ?? []).forEach((row) => {
    const existing = pscMap.get(row.watchlist_id) ?? []
    existing.push(row.psc_code)
    pscMap.set(row.watchlist_id, existing)
  })

  const exclusionMap = new Map<string, string[]>()
  ;(exclusionsResult.data ?? []).forEach((row) => {
    const existing = exclusionMap.get(row.watchlist_id) ?? []
    existing.push(row.exclusion)
    exclusionMap.set(row.watchlist_id, existing)
  })

  const editingKeywords = editingWatchlist ? keywordMap.get(editingWatchlist.id) ?? [] : []
  const editingNaics = editingWatchlist ? naicsMap.get(editingWatchlist.id) ?? [] : []
  const editingPsc = editingWatchlist ? pscMap.get(editingWatchlist.id) ?? [] : []
  const editingExclusions = editingWatchlist ? exclusionMap.get(editingWatchlist.id) ?? [] : []

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Watchlists</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Track what matters</h1>
        <p className="mt-3 text-slate-700">
          Build targeted watchlists from verified company data and prepare for SAM.gov opportunity matching.
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

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{editingWatchlist ? 'Edit watchlist' : 'Create watchlist'}</h2>
            {editingWatchlist ? (
              <p className="mt-2 text-sm text-slate-600">
                Editing {editingWatchlist.name}. Save to update the existing watchlist instead of creating a new one.
              </p>
            ) : null}
            <form action={saveWatchlist} className="mt-5 space-y-4">
              {editingWatchlist ? <input type="hidden" name="watchlistId" value={editingWatchlist.id} /> : null}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
                  Watchlist name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  defaultValue={editingWatchlist?.name ?? ''}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Core federal targets"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="keywords">
                  Keywords
                </label>
                <input
                  id="keywords"
                  name="keywords"
                  required
                  defaultValue={editingKeywords.join(', ')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="cloud migration, cybersecurity, data analytics"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="naicsCodes">
                  NAICS codes
                </label>
                <input
                  id="naicsCodes"
                  name="naicsCodes"
                  required
                  defaultValue={editingNaics.join(', ')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="541512, 541511"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pscCodes">
                  PSC codes
                </label>
                <input
                  id="pscCodes"
                  name="pscCodes"
                  defaultValue={editingPsc.join(', ')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="R425, D302"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="exclusions">
                  Exclusions
                </label>
                <input
                  id="exclusions"
                  name="exclusions"
                  defaultValue={editingExclusions.join(', ')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="construction, staffing, medical"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
                  {editingWatchlist ? 'Update watchlist' : 'Save watchlist'}
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  Back to dashboard
                </Link>
                {editingWatchlist ? (
                  <Link
                    href="/watchlists"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                  >
                    Cancel edit
                  </Link>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Current watchlists</h2>
            <div className="mt-5 space-y-4">
              {(watchlists ?? []).length > 0 ? (
                watchlists?.map((watchlist) => (
                  <article key={watchlist.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-ink">{watchlist.name}</h3>
                        <p className="text-xs text-slate-500">{watchlist.is_active ? 'Active' : 'Inactive'}</p>
                      </div>
                      <div className="flex gap-3">
                        <Link href={`/watchlists?editId=${watchlist.id}`} className="text-sm font-medium text-accent hover:underline">
                          Edit
                        </Link>
                        <form action={deleteWatchlist}>
                          <input type="hidden" name="watchlistId" value={watchlist.id} />
                          <button type="submit" className="text-sm font-medium text-signal hover:underline">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm text-slate-700">
                      <div>
                        <dt className="font-medium text-slate-900">Keywords</dt>
                        <dd>{toCsv(keywordMap.get(watchlist.id)) || 'None yet'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">NAICS</dt>
                        <dd>{toCsv(naicsMap.get(watchlist.id)) || 'None yet'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">PSC</dt>
                        <dd>{toCsv(pscMap.get(watchlist.id)) || 'None yet'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">Exclusions</dt>
                        <dd>{toCsv(exclusionMap.get(watchlist.id)) || 'None yet'}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-600">No watchlists yet. Create your first one on the left.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}