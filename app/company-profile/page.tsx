import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { saveCompanyProfile } from '@/app/company-profile/actions'

type CompanyProfilePageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

function toCsv(values: string[] | null | undefined) {
  return values && values.length > 0 ? values.join(', ') : ''
}

export default async function CompanyProfilePage({ searchParams }: CompanyProfilePageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error

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
    .select('id, name, website')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  const { data: profile } = company
    ? await supabase
        .from('company_profiles')
        .select(
          'capability_statement, certifications, team_size, geographic_coverage, preferred_agencies, keywords, excluded_industries',
        )
        .eq('company_id', company.id)
        .maybeSingle()
    : { data: null }

  const { data: naicsLinks } = company
    ? await supabase
        .from('company_naics_codes')
        .select('naics_code')
        .eq('company_id', company.id)
        .order('naics_code', { ascending: true })
    : { data: [] }

  const { data: pscLinks } = company
    ? await supabase
        .from('company_psc_codes')
        .select('psc_code')
        .eq('company_id', company.id)
        .order('psc_code', { ascending: true })
    : { data: [] }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_35%),linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Company Profile</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Phase 1 Intake</h1>
        <p className="mt-2 text-sm text-slate-600">
          Save verified company data used by matching and proposal workflows.
        </p>

        {message ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <form action={saveCompanyProfile} className="mt-6 space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="companyName">
              Company name
            </label>
            <input
              id="companyName"
              name="companyName"
              required
              defaultValue={company?.name ?? ''}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="website">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="url"
              defaultValue={company?.website ?? ''}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="capabilityStatement">
              Capability statement
            </label>
            <textarea
              id="capabilityStatement"
              name="capabilityStatement"
              rows={4}
              defaultValue={profile?.capability_statement ?? ''}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="teamSize">
                Team size
              </label>
              <input
                id="teamSize"
                name="teamSize"
                defaultValue={profile?.team_size ?? ''}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="geographicCoverage">
                Geographic coverage
              </label>
              <input
                id="geographicCoverage"
                name="geographicCoverage"
                defaultValue={profile?.geographic_coverage ?? ''}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="naicsCodes">
              NAICS codes (comma separated)
            </label>
            <input
              id="naicsCodes"
              name="naicsCodes"
              defaultValue={(naicsLinks ?? []).map((n) => n.naics_code).join(', ')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="541512, 541511"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pscCodes">
              PSC codes (comma separated)
            </label>
            <input
              id="pscCodes"
              name="pscCodes"
              defaultValue={(pscLinks ?? []).map((p) => p.psc_code).join(', ')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="R425, D302"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="certifications">
              Certifications (comma separated)
            </label>
            <input
              id="certifications"
              name="certifications"
              defaultValue={toCsv(profile?.certifications)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="preferredAgencies">
              Preferred agencies (comma separated)
            </label>
            <input
              id="preferredAgencies"
              name="preferredAgencies"
              defaultValue={toCsv(profile?.preferred_agencies)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="keywords">
              Keywords (comma separated)
            </label>
            <input
              id="keywords"
              name="keywords"
              defaultValue={toCsv(profile?.keywords)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="excludedIndustries">
              Excluded industries (comma separated)
            </label>
            <input
              id="excludedIndustries"
              name="excludedIndustries"
              defaultValue={toCsv(profile?.excluded_industries)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Save profile
            </button>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              Back to dashboard
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
