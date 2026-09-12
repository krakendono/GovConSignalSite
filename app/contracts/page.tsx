import Link from 'next/link'
import { getGoDaddyContracts, getGoDaddyGatewayUrl, goDaddyFileUrl } from '@/lib/godaddy-contracts'

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Unknown size'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export default async function ContractsPage() {
  const configured = Boolean(getGoDaddyGatewayUrl())
  let contracts = [] as Awaited<ReturnType<typeof getGoDaddyContracts>>['contracts']
  let error = ''

  if (configured) {
    try {
      const result = await getGoDaddyContracts()
      contracts = result.contracts
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load contracts from GoDaddy.'
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-14">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">GovConOne Vault</p>
            <h1 className="mt-3 text-4xl font-semibold text-ink">Contract Library</h1>
            <p className="mt-3 max-w-2xl text-slate-700">
              Original solicitation packages served directly from the GoDaddy contract vault. Public browsing does not use the Render application.
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
            Home
          </Link>
        </div>

        {!configured ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            GoDaddy contract gateway is not configured yet. Add the server-only GODADDY_CONTRACT_GATEWAY_URL environment variable in Vercel.
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}</div>
        ) : contracts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No contract manifests were found in the GoDaddy vault.</div>
        ) : (
          <div className="mt-8 space-y-5">
            {contracts.map((contract) => (
              <article key={`${contract.noticeId}-${contract.retrievedAtUtc ?? ''}`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-ink">{contract.title || contract.noticeId}</h2>
                    <p className="mt-1 text-sm text-slate-600">Notice ID: {contract.noticeId || 'N/A'}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{contract.status || 'Stored'}</span>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                  <p>Solicitation: {contract.solicitationNumber ?? 'N/A'}</p>
                  <p>Type: {contract.contractType ?? 'N/A'}</p>
                  <p>Due: {formatDate(contract.responseDeadline)}</p>
                  <p>Retrieved: {formatDate(contract.retrievedAtUtc)}</p>
                  <p>Files: {contract.files.length}</p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {contract.samUrl ? (
                    <a href={contract.samUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50">
                      Open SAM notice
                    </a>
                  ) : null}
                </div>

                {contract.files.length > 0 ? (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-ink">Original solicitation files</h3>
                    <div className="mt-3 grid gap-2">
                      {contract.files.map((file) => (
                        <a
                          key={file.storagePath}
                          href={goDaddyFileUrl(file.storagePath)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
                        >
                          <span className="font-medium text-signal">{file.originalFileName || file.savedFileName}</span>
                          <span className="text-xs text-slate-500">{formatBytes(file.fileSizeBytes)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
