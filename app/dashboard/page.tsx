import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { canAccessAdmin } from '@/lib/admin'
import { signOut } from '@/app/auth/login/actions'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
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

  const showAdminLink = canAccessAdmin(user.email)
  const isTemporarySession = user.is_anonymous

  let unreadNotifications = 0
  if (!isTemporarySession) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('owner_user_id', user.id)
      .maybeSingle()

    if (company) {
      const { count } = await supabase
        .from('watchlist_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('is_read', false)

      unreadNotifications = count ?? 0
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#ecfdf5)] px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-3 text-slate-700">Signed in as {user.email ?? 'Temporary local session'}</p>
        {isTemporarySession ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This is a temporary unsaved session. Sign in to a real account to persist company profiles and
            watchlists.
          </p>
        ) : null}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Phase 1 Progress</h2>
          <p className="mt-2 text-sm text-slate-700">
            Auth is active, company profile intake is available, and watchlists are ready for setup.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/company-profile" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">Open company profile</Link>
            <Link href="/watchlists" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Open watchlists</Link>
            <Link href="/opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Open opportunities</Link>
            <Link href="/opportunities" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100">Proposal prep</Link>
            <Link href="/active-opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Active opportunities</Link>
            <Link href="/closed-opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Closed opportunities</Link>
            <Link href="/taken-opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Taken opportunities</Link>
            <Link href="/notifications" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">Notifications {unreadNotifications > 0 ? `(${unreadNotifications})` : ''}</Link>
            {showAdminLink ? (
              <Link href="/admin" className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">Open admin</Link>
            ) : null}
          </div>
          <form action={signOut} className="mt-4">
            <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  )
}
