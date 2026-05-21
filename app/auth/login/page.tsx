import Link from 'next/link'
import { signInWithMagicLink } from '@/app/auth/login/actions'

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dcfce7,transparent_40%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-6 py-20">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">GovSignal AI</p>
        <h1 className="mt-3 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use a secure magic link to access your procurement workspace.
        </p>
        {message ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <form action={signInWithMagicLink} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-signal/40 transition focus:ring"
            placeholder="you@company.com"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Send magic link
          </button>
        </form>

        <Link href="/" className="mt-6 inline-block text-sm font-medium text-signal hover:underline">
          Back to home
        </Link>
      </section>
    </main>
  )
}
