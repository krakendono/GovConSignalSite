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

export default async function AdminPage({ searchParams }: AdminPageProps) {
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

  if (!canAccessAdmin(user.email)) {
    redirect('/dashboard?error=Admin%20access%20required')
  }

  const localBypassEnabled = isLocalAdminBypassEnabled()

  const adminClient = createSupabaseAdminClient()

  const [usersResult, companiesResult, statusesResult, logsResult, watchlistsResult] = await Promise.all([
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
  ])

  const users = (usersResult.data ?? []) as PublicUser[]
  const companies = (companiesResult.data ?? []) as Company[]
  const statuses = (statusesResult.data ?? []) as UserStatus[]
  const logs = (logsResult.data ?? []) as AuditLog[]
  const watchlists = (watchlistsResult.data ?? []) as Watchlist[]

  const companyByOwner = new Map<string, Company>()
  companies.forEach((company) => {
    companyByOwner.set(company.owner_user_id, company)
  })

  const statusByUser = new Map<string, UserStatus>()
  statuses.forEach((status) => {
    statusByUser.set(status.user_id, status)
  })

  const watchlistsByCompany = new Map<string, Watchlist[]>()
  watchlists.forEach((watchlist) => {
    const existing = watchlistsByCompany.get(watchlist.company_id) ?? []
    existing.push(watchlist)
    watchlistsByCompany.set(watchlist.company_id, existing)
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
            <div className="mt-4 space-y-4">
              {users.length === 0 ? (
                <p className="text-sm text-slate-600">No users found yet.</p>
              ) : (
                users.map((record) => {
                  const company = companyByOwner.get(record.id)
                  const status = statusByUser.get(record.id)
                  const companyWatchlists = company ? (watchlistsByCompany.get(company.id) ?? []) : []
                  return (
                    <article key={record.id} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">User ID</p>
                      <p className="break-all text-sm font-medium text-ink">{record.id}</p>
                      <p className="mt-2 text-sm text-slate-700">Created: {formatDate(record.created_at)}</p>
                      <p className="text-sm text-slate-700">Company: {company?.name ?? 'No company yet'}</p>
                      <p className="text-sm text-slate-700">
                        Status: <span className="font-medium">{status?.account_status ?? 'active'}</span>
                      </p>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-800">Watchlists</p>
                        {companyWatchlists.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-600">No watchlists for this user yet.</p>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {companyWatchlists.map((watchlist) => (
                              <p key={watchlist.id} className="text-sm text-slate-700">
                                {watchlist.name} ({watchlist.is_active ? 'active' : 'inactive'})
                              </p>
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
                    </article>
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
