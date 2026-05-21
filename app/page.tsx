import { isSupabaseConfigured } from '@/lib/env'
import Link from 'next/link'

export default function Home() {
  const supabaseConfigured = isSupabaseConfigured()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#ffedd5,transparent_45%),linear-gradient(180deg,#f7f8f5,#eef2ef)]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-24">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-signal">
          GovSignal AI
        </p>
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-ink sm:text-5xl md:text-6xl">
          Find better federal contracts. Understand them faster. Draft proposals in minutes.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-slate-700 sm:text-lg">
          This baseline implements Phase 1 foundation from the master prompt: a Next.js web app
          prepared for auth, company profiles, and GSA opportunity ingestion.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500">Current phase</p>
            <p className="mt-2 text-lg font-semibold text-ink">MVP Phase 1</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500">Next milestone</p>
            <p className="mt-2 text-lg font-semibold text-ink">Supabase + Auth</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500">Data source</p>
            <p className="mt-2 text-lg font-semibold text-ink">SAM.gov Opportunities API</p>
          </div>
        </div>
        <div className="mt-6 inline-flex w-fit items-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-700">
          Supabase status:&nbsp;
          <span className={supabaseConfigured ? 'font-semibold text-accent' : 'font-semibold text-signal'}>
            {supabaseConfigured ? 'configured' : 'missing env values'}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/auth/login"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white"
          >
            Open dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
