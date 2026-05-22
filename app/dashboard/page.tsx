import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#ecfdf5)] px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-3 text-slate-700">Signed in as {user.email}</p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Phase 1 Progress</h2>
          <p className="mt-2 text-sm text-slate-700">
            Auth is active and company profile intake is now available.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/company-profile"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Open company profile
            </Link>
          </div>
          <form action={signOut} className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
