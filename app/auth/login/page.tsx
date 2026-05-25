import Link from 'next/link'
import {
  sendPasswordResetLink,
  signInWithPassword,
  signUpWithPassword,
} from '@/app/auth/login/actions'

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
    intent?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error
  const isSignupIntent = params?.intent === 'signup'
  const isLocalBypassMode = process.env.NODE_ENV !== 'production'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dcfce7,transparent_40%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-6 py-20">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">GovSignal AI</p>
        <h1 className="mt-3 text-2xl font-semibold text-ink">{isSignupIntent ? 'Create account' : 'Sign in'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use password sign-in for local development. Email-based login is not available until an email provider is configured.
        </p>
        <Link
          href="/auth/test-user?email=m%40s.com"
          className="mt-5 block w-full rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-center text-sm font-medium text-accent transition hover:bg-accent/15"
        >
          Continue as m@s.com
        </Link>
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

        <form action={signInWithPassword} className="mt-6 space-y-4">
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
          <label className="block text-sm text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-signal/40 transition focus:ring"
            placeholder="At least 8 characters"
          />
          <div className="grid gap-2">
            <button
              type="submit"
              formAction={isSignupIntent ? signUpWithPassword : signInWithPassword}
              className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              {isSignupIntent ? 'Create account' : 'Sign in with password'}
            </button>
            {!isSignupIntent ? (
              <button
                type="submit"
                formAction={sendPasswordResetLink}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {isLocalBypassMode ? 'Recover account (local dev)' : 'Forgot password'}
              </button>
            ) : null}
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          For local development, anonymous sign-in is the fastest path. Password sign-in and magic link are still available if you want a named account.
        </p>
        <div className="mt-3">
          {isSignupIntent ? (
            <Link href="/auth/login" className="text-sm font-medium text-signal hover:underline">
              Already have an account? Sign in
            </Link>
          ) : (
            <Link href="/auth/login?intent=signup" className="text-sm font-medium text-signal hover:underline">
              Need an account? Create one
            </Link>
          )}
        </div>

        <Link href="/" className="mt-6 inline-block text-sm font-medium text-signal hover:underline">
          Back to home
        </Link>
      </section>
    </main>
  )
}
