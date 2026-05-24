import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function Page() {
  const supabaseReady = isSupabaseConfigured()
  let userEmail: string | null = null

  if (supabaseReady) {
    try {
      const supabase = await createSupabaseServerClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userEmail = user?.email ?? null
    } catch {
      userEmail = null
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-signal">GovSignal AI</p>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
        Federal opportunity intelligence for smarter bid decisions.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink/80">
        Track opportunities, align your NAICS and PSC capabilities, and move from search to action in
        one workflow.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/auth/login"
          className="rounded-full bg-signal px-5 py-2.5 font-medium text-base text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/auth/login?intent=signup"
          className="rounded-full border border-accent bg-accent px-5 py-2.5 font-medium text-base text-white shadow-sm transition hover:opacity-90"
        >
          Create account
        </Link>
      </div>

      <section className="mt-12 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Status</h2>
        {!supabaseReady ? (
          <p className="mt-2 text-sm text-ink/75">
            Supabase environment variables are missing. Add them in .env.local to enable auth and
            saved company data.
          </p>
        ) : userEmail ? (
          <p className="mt-2 text-sm text-ink/75">Signed in as {userEmail}.</p>
        ) : (
          <p className="mt-2 text-sm text-ink/75">Supabase is connected. Sign in to continue.</p>
        )}
      </section>
    </main>
  )
}
