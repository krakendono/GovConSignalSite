import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { loadProposalWorkspaceData } from '@/lib/proposal-workspace'
import ProposalWorkspaceForm from '@/app/proposal-prep/[opportunityId]/proposal-workspace-form'

type ProposalPrepPageProps = {
  params: Promise<{
    opportunityId: string
  }>
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

type WorkspaceData = Awaited<ReturnType<typeof loadProposalWorkspaceData>>

function formatDate(value: string | null) {
  if (!value) {
    return 'N/A'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString()
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function buildAutoAnswer(question: string, workspace: NonNullable<WorkspaceData>) {
  const normalizedQuestion = question.toLowerCase()

  const contactEmails = workspace.research.contactEmails
  const contactNames = workspace.research.contacts
    .map((contact) => contact.name)
    .filter((name): name is string => Boolean(name && name.trim().length > 0))
  const attachmentNames = workspace.research.attachments
    .map((attachment) => attachment.title ?? attachment.url ?? null)
    .filter((value): value is string => Boolean(value))
  const uploadedDocumentNames = workspace.contractDocuments.map((document) => document.file_name)

  if (normalizedQuestion.includes('contact') || normalizedQuestion.includes('email')) {
    const parts = []
    if (contactEmails.length > 0) {
      parts.push(`Confirmed contact emails: ${contactEmails.join(', ')}.`)
    }
    if (contactNames.length > 0) {
      parts.push(`Contact names extracted: ${contactNames.join(', ')}.`)
    }
    if (parts.length === 0) {
      return 'No confirmed contact details were extracted from the current payload yet.'
    }
    return parts.join(' ')
  }

  if (
    normalizedQuestion.includes('document') ||
    normalizedQuestion.includes('attachment') ||
    normalizedQuestion.includes('compliance') ||
    normalizedQuestion.includes('submission')
  ) {
    const lines: string[] = []
    if (attachmentNames.length > 0) {
      lines.push(`Notice attachments/links: ${attachmentNames.slice(0, 8).join(', ')}.`)
    }
    if (uploadedDocumentNames.length > 0) {
      lines.push(`Uploaded contract docs: ${uploadedDocumentNames.slice(0, 8).join(', ')}.`)
    }
    if (workspace.research.missingDocumentSignals.length > 0) {
      lines.push(`Missing document signals: ${workspace.research.missingDocumentSignals.join(' | ')}.`)
    }
    return lines.length > 0 ? lines.join(' ') : 'No attachment or uploaded-document records are available yet.'
  }

  if (
    normalizedQuestion.includes('naics') ||
    normalizedQuestion.includes('psc') ||
    normalizedQuestion.includes('certification') ||
    normalizedQuestion.includes('qualification')
  ) {
    const certifications = workspace.companyProfile.certifications.length > 0 ? workspace.companyProfile.certifications.join(', ') : 'None listed'
    const naicsCodes = workspace.companyProfile.naicsCodes.length > 0 ? workspace.companyProfile.naicsCodes.join(', ') : 'None listed'
    const pscCodes = workspace.companyProfile.pscCodes.length > 0 ? workspace.companyProfile.pscCodes.join(', ') : 'None listed'
    return `Current company profile data: Certifications: ${certifications}. NAICS: ${naicsCodes}. PSC: ${pscCodes}.`
  }

  if (normalizedQuestion.includes('deadline') || normalizedQuestion.includes('due')) {
    return `Current response deadline in workspace: ${formatDate(workspace.opportunity.response_deadline_at)}.`
  }

  if (normalizedQuestion.includes('experience') || normalizedQuestion.includes('past performance') || normalizedQuestion.includes('incumbent') || normalizedQuestion.includes('award')) {
    if (workspace.brief.awardHistory) {
      return `Historical award intelligence: ${workspace.brief.awardHistory.summaryText ?? 'Summary unavailable.'} Incumbent: ${workspace.brief.awardHistory.incumbentVendor ?? 'N/A'}. Awards found: ${workspace.brief.awardHistory.awardCount}.`
    }
    return 'No historical award intelligence is currently stored for this opportunity.'
  }

  if (normalizedQuestion.includes('risk') || normalizedQuestion.includes('missing') || normalizedQuestion.includes('gap')) {
    const gaps = workspace.brief.missingCompanyInputs
    const signals = workspace.research.missingDocumentSignals
    if (gaps.length === 0 && signals.length === 0) {
      return 'No major missing-input signals are currently detected in this workspace.'
    }

    return [
      gaps.length > 0 ? `Company input gaps: ${gaps.join(' | ')}.` : null,
      signals.length > 0 ? `Document/research gaps: ${signals.join(' | ')}.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
  }

  return [
    `Opportunity: ${workspace.opportunity.title}.`,
    `Agency: ${workspace.opportunity.agency ?? 'N/A'}.`,
    `Summary: ${workspace.brief.summaryText}.`,
  ].join(' ')
}

export const dynamic = 'force-dynamic'

export default async function ProposalPrepPage({ params, searchParams }: ProposalPrepPageProps) {
  const { opportunityId } = await params
  const paramsData = searchParams ? await searchParams : undefined
  const message = paramsData?.message
  const error = paramsData?.error

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

  if (user.is_anonymous) {
    redirect('/dashboard?error=Sign%20in%20to%20prepare%20proposals')
  }

  const workspace = await loadProposalWorkspaceData(supabase, user.id, opportunityId)

  if (!workspace) {
    notFound()
  }

  const initialAnswers = workspace.questions.map((question) => {
    const existingAnswer = workspace.draft?.question_answers.find((entry) => entry.question === question.question)?.answer?.trim()
    if (existingAnswer) {
      return existingAnswer
    }

    return buildAutoAnswer(question.question, workspace)
  })

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_30%),linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Proposal Workspace</p>
            <h1 className="mt-3 text-4xl font-semibold text-ink">Editable brief for {workspace.brief.title}</h1>
            <p className="mt-2 text-sm text-slate-600">Draft from verified data, AI research, and historical intelligence. Nothing is auto-submitted.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/opportunities" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
              Back to opportunities
            </Link>
          </div>
        </div>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <ProposalWorkspaceForm
            opportunityId={workspace.opportunityId}
            contractNoticeUrl={workspace.opportunity.notice_url}
            initialProposalSummary={workspace.draft?.proposal_summary ?? workspace.brief.summaryText ?? ''}
            initialResponseStrategy={workspace.draft?.response_strategy ?? workspace.research.aiSummary ?? ''}
            initialComplianceChecklist={workspace.draft?.compliance_checklist ?? workspace.research.missingDocumentSignals.join('\n')}
            initialRiskNotes={workspace.draft?.risk_notes ?? ''}
            questions={workspace.questions}
            initialAnswers={initialAnswers}
            initialExportReady={workspace.draft?.export_ready ?? false}
            initialScopeItems={workspace.draft?.proposal_sections.scope ?? []}
            initialApproachItems={workspace.draft?.proposal_sections.approach ?? []}
            initialPastPerformanceClaims={workspace.draft?.proposal_sections.pastPerformanceClaims ?? []}
            uploadedDocuments={workspace.contractDocuments.map((item) => ({
              id: item.id,
              fileName: item.file_name,
              mimeType: item.mime_type,
              uploadedAt: item.uploaded_at,
              hasExtractedText: item.extracted_text.trim().length > 0,
            }))}
          />

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink">Opportunity snapshot</h2>
              <p className="mt-2 text-sm text-slate-700">{workspace.brief.summaryText}</p>
              <div className="mt-4 grid gap-2 text-sm text-slate-700">
                <p>Company: {workspace.companyName}</p>
                <p>Agency: {workspace.brief.agency}</p>
                <p>Posted: {formatDate(workspace.brief.postedAt)}</p>
                <p>Response due: {formatDate(workspace.brief.responseDeadlineAt)}</p>
                <p>NAICS: {workspace.opportunity.naics_code ?? 'N/A'}</p>
                <p>PSC: {workspace.opportunity.psc_code ?? 'N/A'}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-sky-200 bg-sky-50/90 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-sky-950">AI research brief</h2>
              <p className="mt-3 text-sm text-sky-950">{workspace.research.aiSummary}</p>

              <div className="mt-4 rounded-lg border border-sky-200 bg-white p-3 text-sm text-sky-950">
                <p className="font-semibold uppercase tracking-wide">SAM API extracted sections</p>
                <div className="mt-3 space-y-3">
                  <ApiSectionList title="Solicitation details" items={workspace.research.apiSections.solicitationDetails} />
                  <ApiSectionList title="Classification" items={workspace.research.apiSections.classification} />
                  <ApiSectionList title="Description" items={workspace.research.apiSections.description} />
                  <ApiSectionList title="Contact information" items={workspace.research.apiSections.contactInformation} />
                  <ApiSectionList title="Attachments and links" items={workspace.research.apiSections.attachmentsLinks} />
                </div>
              </div>

              {workspace.research.contactEmails.length > 0 ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-sm text-sky-950">
                  <p className="font-semibold uppercase tracking-wide">Contact emails</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {workspace.research.contactEmails.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {workspace.research.attachments.length > 0 ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-sm text-sky-950">
                  <p className="font-semibold uppercase tracking-wide">Documents and attachments</p>
                  <ul className="mt-2 space-y-2">
                    {workspace.research.attachments.map((attachment) => (
                      <li key={`${attachment.title ?? 'attachment'}-${attachment.url ?? 'no-url'}`}>
                        <span className="font-medium">{attachment.title ?? 'Unnamed document'}</span>
                        {attachment.type ? <span className="ml-2 text-sky-800">({attachment.type})</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-amber-950">Historical intelligence</h2>
              {workspace.brief.awardHistory ? (
                <div className="mt-3 space-y-2 text-sm text-amber-950">
                  <p>{workspace.brief.awardHistory.summaryText ?? 'Historical award context not available.'}</p>
                  <p>Awards found: {workspace.brief.awardHistory.awardCount}</p>
                  <p>Incumbent: {workspace.brief.awardHistory.incumbentVendor ?? 'N/A'}</p>
                  <p>Last award: {formatDate(workspace.brief.awardHistory.lastAwardDate)}</p>
                  <p>Total value: {formatCurrency(workspace.brief.awardHistory.totalAwardValue)}</p>
                  <p>Rebid signal: {workspace.brief.awardHistory.rebidSignal ?? 'N/A'}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-amber-950">No historical award intelligence has been stored for this opportunity yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink">Opportunity inputs used</h2>
              <div className="mt-4 grid gap-3">
                {workspace.brief.opportunityInputs.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-rose-200 bg-rose-50/90 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-rose-950">Missing inputs</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-950">
                {workspace.brief.missingCompanyInputs.length > 0 ? (
                  workspace.brief.missingCompanyInputs.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>No major company setup gaps detected.</li>
                )}
              </ul>
            </section>
          </aside>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Proposal outline</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            {workspace.brief.outline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  )
}

function ApiSectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-sky-900">
          {items.slice(0, 6).map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-sky-800">No values extracted from current API payload.</p>
      )}
    </div>
  )
}
