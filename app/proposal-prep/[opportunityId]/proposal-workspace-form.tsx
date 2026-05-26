'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { autosaveProposalDraft, generateAiProposalDraft, saveProposalDraft, uploadContractDocuments } from '@/app/proposal-prep/actions'

type Question = {
  question: string
  rationale: string
}

type SectionItem = {
  title: string
  detail: string
  evidence: string
}

type PastPerformanceClaim = {
  claim: string
  evidence: string
  relevance: string
}

type ProposalWorkspaceFormProps = {
  opportunityId: string
  contractNoticeUrl: string | null
  initialProposalSummary: string
  initialResponseStrategy: string
  initialComplianceChecklist: string
  initialRiskNotes: string
  questions: Question[]
  initialAnswers: string[]
  initialExportReady: boolean
  initialScopeItems: SectionItem[]
  initialApproachItems: SectionItem[]
  initialPastPerformanceClaims: PastPerformanceClaim[]
  uploadedDocuments: Array<{
    id: string
    fileName: string
    mimeType: string | null
    uploadedAt: string
    hasExtractedText: boolean
  }>
}

const EMPTY_SECTION_ITEM: SectionItem = {
  title: '',
  detail: '',
  evidence: '',
}

const EMPTY_PAST_PERFORMANCE_CLAIM: PastPerformanceClaim = {
  claim: '',
  evidence: '',
  relevance: '',
}

export default function ProposalWorkspaceForm({
  opportunityId,
  contractNoticeUrl = null,
  initialProposalSummary,
  initialResponseStrategy,
  initialComplianceChecklist,
  initialRiskNotes,
  questions,
  initialAnswers,
  initialExportReady,
  initialScopeItems,
  initialApproachItems,
  initialPastPerformanceClaims,
  uploadedDocuments = [],
}: ProposalWorkspaceFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generatedOnLoadRef = useRef(false)
  const shouldAutosaveRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [autosaveError, setAutosaveError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [proposalSummary, setProposalSummary] = useState(initialProposalSummary)
  const [responseStrategy, setResponseStrategy] = useState(initialResponseStrategy)
  const [complianceChecklist, setComplianceChecklist] = useState(initialComplianceChecklist)
  const [riskNotes, setRiskNotes] = useState(initialRiskNotes)
  const [questionAnswers, setQuestionAnswers] = useState(questions.map((_, index) => initialAnswers[index] ?? ''))
  const [exportReady, setExportReady] = useState(initialExportReady)
  const [scopeItems, setScopeItems] = useState(initialScopeItems.length > 0 ? initialScopeItems : [{ ...EMPTY_SECTION_ITEM }])
  const [approachItems, setApproachItems] = useState(initialApproachItems.length > 0 ? initialApproachItems : [{ ...EMPTY_SECTION_ITEM }])
  const [pastPerformanceClaims, setPastPerformanceClaims] = useState(
    initialPastPerformanceClaims.length > 0 ? initialPastPerformanceClaims : [{ ...EMPTY_PAST_PERFORMANCE_CLAIM }],
  )

  const hasExistingDraft = useMemo(
    () =>
      Boolean(
        initialProposalSummary.trim() ||
          initialResponseStrategy.trim() ||
          initialComplianceChecklist.trim() ||
          initialRiskNotes.trim() ||
          initialScopeItems.length > 0 ||
          initialApproachItems.length > 0 ||
          initialPastPerformanceClaims.length > 0,
      ),
    [
      initialProposalSummary,
      initialResponseStrategy,
      initialComplianceChecklist,
      initialRiskNotes,
      initialScopeItems.length,
      initialApproachItems.length,
      initialPastPerformanceClaims.length,
    ],
  )

  const applyGeneratedDraft = (draft: {
    proposalSummary: string
    responseStrategy: string
    complianceChecklist: string
    riskNotes: string
    exportReady: boolean
    proposalSections: {
      scope: SectionItem[]
      approach: SectionItem[]
      pastPerformanceClaims: PastPerformanceClaim[]
    }
  }) => {
    setProposalSummary(draft.proposalSummary)
    setResponseStrategy(draft.responseStrategy)
    setComplianceChecklist(draft.complianceChecklist)
    setRiskNotes(draft.riskNotes)
    setScopeItems(draft.proposalSections.scope.length > 0 ? draft.proposalSections.scope : [{ ...EMPTY_SECTION_ITEM }])
    setApproachItems(draft.proposalSections.approach.length > 0 ? draft.proposalSections.approach : [{ ...EMPTY_SECTION_ITEM }])
    setPastPerformanceClaims(
      draft.proposalSections.pastPerformanceClaims.length > 0
        ? draft.proposalSections.pastPerformanceClaims
        : [{ ...EMPTY_PAST_PERFORMANCE_CLAIM }],
    )
    setExportReady(draft.exportReady)
  }

  const runAiGeneration = () => {
    setIsGenerating(true)
    setGenerateError(null)

    startTransition(async () => {
      const result = await generateAiProposalDraft(opportunityId)
      if (!result.ok || !result.draft) {
        setGenerateError(result.error ?? 'AI draft generation failed')
        setIsGenerating(false)
        return
      }

      applyGeneratedDraft(result.draft)
      const savedTime = new Date(result.savedAt ?? new Date().toISOString()).toLocaleTimeString()
      setAiGeneratedAt(savedTime)
      setLastSavedAt(savedTime)
      setIsGenerating(false)
    })
  }

  useEffect(() => {
    if (generatedOnLoadRef.current) {
      return
    }

    generatedOnLoadRef.current = true
    if (!hasExistingDraft) {
      runAiGeneration()
    }
  }, [hasExistingDraft])

  const autosaveFingerprint = useMemo(
    () =>
      JSON.stringify({
        proposalSummary,
        responseStrategy,
        complianceChecklist,
        riskNotes,
        questionAnswers,
        exportReady,
        scopeItems,
        approachItems,
        pastPerformanceClaims,
      }),
    [proposalSummary, responseStrategy, complianceChecklist, riskNotes, questionAnswers, exportReady, scopeItems, approachItems, pastPerformanceClaims],
  )

  useEffect(() => {
    if (!shouldAutosaveRef.current) {
      shouldAutosaveRef.current = true
      return
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = setTimeout(() => {
      if (!formRef.current) {
        return
      }

      setIsSaving(true)
      setAutosaveError(null)

      const formData = new FormData(formRef.current)
      startTransition(async () => {
        const result = await autosaveProposalDraft(formData)
        if (!result.ok) {
          setAutosaveError(result.error ?? 'Autosave failed')
          setIsSaving(false)
          return
        }

        setLastSavedAt(new Date(result.savedAt ?? new Date().toISOString()).toLocaleTimeString())
        setIsSaving(false)
      })
    }, 900)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [autosaveFingerprint, startTransition])

  const saveStatus = isSaving || isPending ? 'Autosaving...' : lastSavedAt ? `Saved at ${lastSavedAt}` : 'No autosave yet'

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Edit brief resources</h2>
        <p className="mt-2 text-sm text-slate-700">Open the contract notice and upload related files so AI can use additional context.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {contractNoticeUrl ? (
            <a
              href={contractNoticeUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              Open contract notice
            </a>
          ) : (
            <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-500">No contract notice link available</span>
          )}
        </div>

        <form action={uploadContractDocuments} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <label className="block text-sm font-medium text-slate-700" htmlFor="contractDocuments">
            Upload contract documents
          </label>
          <input
            id="contractDocuments"
            name="contractDocuments"
            type="file"
            multiple
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-600">Supported for text extraction: TXT, MD, CSV, JSON, XML. Other file types are still recorded for AI context.</p>
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
            Upload documents
          </button>
        </form>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700">Uploaded contract documents</p>
          {uploadedDocuments.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {uploadedDocuments.map((document) => (
                <li key={document.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="font-medium text-slate-800">{document.fileName}</p>
                  <p className="text-xs text-slate-600">
                    {document.mimeType ?? 'unknown type'} | {new Date(document.uploadedAt).toLocaleString()} | {document.hasExtractedText ? 'text extracted for AI' : 'metadata only'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No uploaded documents yet.</p>
          )}
        </div>
      </section>

      <form ref={formRef} action={saveProposalDraft} className="space-y-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <input type="hidden" name="opportunityId" value={opportunityId} />

      <section>
        <h2 className="text-lg font-semibold text-ink">Proposal draft</h2>
        <p className="mt-2 text-sm text-slate-700">AI writes the full first draft from your company profile and opportunity data. Review, refine, and regenerate as needed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runAiGeneration}
            disabled={isGenerating || isPending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating || isPending ? 'Generating draft...' : 'Generate with AI'}
          </button>
          {aiGeneratedAt ? <p className="text-xs text-slate-500">AI draft generated at {aiGeneratedAt}</p> : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{saveStatus}</p>
        {autosaveError ? <p className="mt-1 text-xs text-rose-600">Autosave failed: {autosaveError}</p> : null}
        {generateError ? <p className="mt-1 text-xs text-rose-600">AI generation failed: {generateError}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="proposalSummary">
            Executive summary
          </label>
          <textarea
            id="proposalSummary"
            name="proposalSummary"
            rows={8}
            value={proposalSummary}
            onChange={(event) => setProposalSummary(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="AI-generated summary appears here."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="responseStrategy">
            Response strategy
          </label>
          <textarea
            id="responseStrategy"
            name="responseStrategy"
            rows={8}
            value={responseStrategy}
            onChange={(event) => setResponseStrategy(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="AI-generated strategy appears here."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-ink">Section builder</h3>
        <p className="mt-1 text-sm text-slate-600">AI also prepares scope, approach, and past performance claims with evidence fields.</p>

        <div className="mt-4 space-y-6">
          <SectionBuilder
            title="Scope"
            itemLabel="scope item"
            items={scopeItems}
            titleField="scopeTitle"
            detailField="scopeDetail"
            evidenceField="scopeEvidence"
            onAdd={() => setScopeItems((prev) => [...prev, { ...EMPTY_SECTION_ITEM }])}
            onRemove={(index) => setScopeItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            onUpdate={(index, key, value) =>
              setScopeItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
            }
          />

          <SectionBuilder
            title="Approach"
            itemLabel="approach step"
            items={approachItems}
            titleField="approachTitle"
            detailField="approachDetail"
            evidenceField="approachEvidence"
            onAdd={() => setApproachItems((prev) => [...prev, { ...EMPTY_SECTION_ITEM }])}
            onRemove={(index) => setApproachItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            onUpdate={(index, key, value) =>
              setApproachItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
            }
          />

          <PastPerformanceBuilder
            claims={pastPerformanceClaims}
            onAdd={() => setPastPerformanceClaims((prev) => [...prev, { ...EMPTY_PAST_PERFORMANCE_CLAIM }])}
            onRemove={(index) => setPastPerformanceClaims((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            onUpdate={(index, key, value) =>
              setPastPerformanceClaims((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
            }
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="complianceChecklist">
            Compliance checklist
          </label>
          <textarea
            id="complianceChecklist"
            name="complianceChecklist"
            rows={7}
            value={complianceChecklist}
            onChange={(event) => setComplianceChecklist(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="AI-generated checklist appears here."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="riskNotes">
            Risk notes
          </label>
          <textarea
            id="riskNotes"
            name="riskNotes"
            rows={7}
            value={riskNotes}
            onChange={(event) => setRiskNotes(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="AI-generated risk notes appear here."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">AI-generated questions</h3>
            <p className="text-sm text-slate-600">Answer these before you finalize export-ready language.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="exportReady"
              checked={exportReady}
              onChange={(event) => setExportReady(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ready for export
          </label>
        </div>

        <div className="mt-4 space-y-4">
          {questions.map((question, index) => (
            <div key={question.question} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-ink">{question.question}</p>
              <p className="mt-1 text-xs text-slate-600">{question.rationale}</p>
              <input type="hidden" name="questionText" value={question.question} />
              <textarea
                name="questionAnswer"
                rows={3}
                value={questionAnswers[index] ?? ''}
                onChange={(event) =>
                  setQuestionAnswers((prev) => prev.map((answer, answerIndex) => (answerIndex === index ? event.target.value : answer)))
                }
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Write the answer here before drafting."
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-ink">Exports</h3>
        <p className="mt-1 text-sm text-slate-600">Mark the draft as ready to enable document exports.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {exportReady ? (
            <a
              href={`/proposal-prep/${opportunityId}/export/pdf`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              Export PDF
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Export PDF
            </button>
          )}
          {exportReady ? (
            <a
              href={`/proposal-prep/${opportunityId}/export/docx`}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
            >
              Export DOCX
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-2 text-sm font-medium text-amber-300"
            >
              Export DOCX
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
          Save draft
        </button>
        <p className="text-sm text-slate-600">Manual save is still available if you want an explicit checkpoint.</p>
      </div>
      </form>
    </div>
  )
}

type SectionBuilderProps = {
  title: string
  itemLabel: string
  items: SectionItem[]
  titleField: string
  detailField: string
  evidenceField: string
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, key: keyof SectionItem, value: string) => void
}

function SectionBuilder({
  title,
  itemLabel,
  items,
  titleField,
  detailField,
  evidenceField,
  onAdd,
  onRemove,
  onUpdate,
}: SectionBuilderProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-800">{title}</h4>
        <button type="button" onClick={onAdd} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Add {itemLabel}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title} #{index + 1}</p>
              {items.length > 1 ? (
                <button type="button" onClick={() => onRemove(index)} className="text-xs font-medium text-rose-600 hover:text-rose-700">
                  Remove
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid gap-3">
              <input
                name={titleField}
                value={item.title}
                onChange={(event) => onUpdate(index, 'title', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Section title"
              />
              <textarea
                name={detailField}
                rows={3}
                value={item.detail}
                onChange={(event) => onUpdate(index, 'detail', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Detail the work, deliverable, or method."
              />
              <textarea
                name={evidenceField}
                rows={2}
                value={item.evidence}
                onChange={(event) => onUpdate(index, 'evidence', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Cite evidence, metrics, or contract references."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type PastPerformanceBuilderProps = {
  claims: PastPerformanceClaim[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, key: keyof PastPerformanceClaim, value: string) => void
}

function PastPerformanceBuilder({ claims, onAdd, onRemove, onUpdate }: PastPerformanceBuilderProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Past performance claims</h4>
        <button type="button" onClick={onAdd} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Add claim
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {claims.map((claim, index) => (
          <div key={`past-performance-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Claim #{index + 1}</p>
              {claims.length > 1 ? (
                <button type="button" onClick={() => onRemove(index)} className="text-xs font-medium text-rose-600 hover:text-rose-700">
                  Remove
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid gap-3">
              <textarea
                name="pastPerformanceClaim"
                rows={2}
                value={claim.claim}
                onChange={(event) => onUpdate(index, 'claim', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="State the relevant prior performance claim."
              />
              <textarea
                name="pastPerformanceEvidence"
                rows={2}
                value={claim.evidence}
                onChange={(event) => onUpdate(index, 'evidence', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Add measurable proof (CPARS, outcomes, contract value)."
              />
              <textarea
                name="pastPerformanceRelevance"
                rows={2}
                value={claim.relevance}
                onChange={(event) => onUpdate(index, 'relevance', event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Explain relevance to this requirement."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
