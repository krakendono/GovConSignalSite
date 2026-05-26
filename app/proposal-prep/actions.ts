'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import {
  createEmptyProposalSections,
  type ProposalDraftRow,
  normalizeProposalSections,
  type ProposalSectionsDraft,
} from '@/lib/proposal-workspace'
import { loadProposalWorkspaceData } from '@/lib/proposal-workspace'
import { generateProposalDraftContent } from '@/lib/proposal-research'
import { extractTextFromUploadedDocument } from '@/lib/document-extraction'
import { getConfiguredAiProviderModel, logUsageEvent } from '@/lib/usage-events'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

function parseQuestionPairs(formData: FormData) {
  const questions = formData.getAll('questionText').map((value) => String(value).trim())
  const answers = formData.getAll('questionAnswer').map((value) => String(value).trim())

  return questions
    .map((question, index) => ({
      question,
      answer: answers[index] ?? '',
    }))
    .filter((item) => item.question.length > 0)
}

function parseSectionItems(formData: FormData, prefix: string) {
  const titles = formData.getAll(`${prefix}Title`).map((value) => String(value).trim())
  const details = formData.getAll(`${prefix}Detail`).map((value) => String(value).trim())
  const evidences = formData.getAll(`${prefix}Evidence`).map((value) => String(value).trim())
  const maxLen = Math.max(titles.length, details.length, evidences.length)

  return Array.from({ length: maxLen }, (_, index) => ({
    title: titles[index] ?? '',
    detail: details[index] ?? '',
    evidence: evidences[index] ?? '',
  })).filter((item) => item.title || item.detail || item.evidence)
}

function parsePastPerformanceClaims(formData: FormData) {
  const claims = formData.getAll('pastPerformanceClaim').map((value) => String(value).trim())
  const evidences = formData.getAll('pastPerformanceEvidence').map((value) => String(value).trim())
  const relevances = formData.getAll('pastPerformanceRelevance').map((value) => String(value).trim())
  const maxLen = Math.max(claims.length, evidences.length, relevances.length)

  return Array.from({ length: maxLen }, (_, index) => ({
    claim: claims[index] ?? '',
    evidence: evidences[index] ?? '',
    relevance: relevances[index] ?? '',
  })).filter((item) => item.claim || item.evidence || item.relevance)
}

function parseProposalSections(formData: FormData): ProposalSectionsDraft {
  const parsed = {
    scope: parseSectionItems(formData, 'scope'),
    approach: parseSectionItems(formData, 'approach'),
    pastPerformanceClaims: parsePastPerformanceClaims(formData),
  }

  return normalizeProposalSections(parsed)
}

async function upsertProposalDraft(formData: FormData) {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured yet', opportunityId: null as string | null }
  }

  const opportunityId = String(formData.get('opportunityId') ?? '').trim()
  if (!opportunityId) {
    return { error: 'Missing opportunity for proposal draft', opportunityId: null as string | null }
  }

  const proposalSummary = String(formData.get('proposalSummary') ?? '').trim()
  const responseStrategy = String(formData.get('responseStrategy') ?? '').trim()
  const complianceChecklist = String(formData.get('complianceChecklist') ?? '').trim()
  const riskNotes = String(formData.get('riskNotes') ?? '').trim()
  const exportReady = String(formData.get('exportReady') ?? '') === 'on'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Please sign in again', opportunityId }
  }

  if (user.is_anonymous) {
    return { error: 'Sign in to edit proposal drafts', opportunityId }
  }

  const { data: company } = await supabase.from('companies').select('id').eq('owner_user_id', user.id).maybeSingle()

  if (!company) {
    return { error: 'Create your company profile first', opportunityId }
  }

  const questionAnswers = parseQuestionPairs(formData)
  const proposalSections = parseProposalSections(formData)

  const { error } = await supabase.from('proposal_drafts').upsert(
    {
      company_id: company.id,
      opportunity_id: opportunityId,
      proposal_summary: proposalSummary,
      response_strategy: responseStrategy,
      compliance_checklist: complianceChecklist,
      risk_notes: riskNotes,
      question_answers: questionAnswers,
      export_ready: exportReady,
      proposal_sections: proposalSections ?? createEmptyProposalSections(),
    },
    { onConflict: 'company_id,opportunity_id' },
  )

  if (error) {
    return { error: error.message, opportunityId }
  }

  return { error: null, opportunityId }
}

export async function saveProposalDraft(formData: FormData) {
  const result = await upsertProposalDraft(formData)
  if (!result.opportunityId) {
    redirect('/opportunities?error=Missing%20opportunity%20for%20proposal%20draft')
  }

  if (result.error) {
    redirect(`/proposal-prep/${result.opportunityId}?error=${encodeURIComponent(result.error)}`)
  }

  redirect(`/proposal-prep/${result.opportunityId}?message=Draft%20saved`)
}

export async function autosaveProposalDraft(formData: FormData) {
  const result = await upsertProposalDraft(formData)
  if (result.error) {
    return { ok: false, error: result.error }
  }

  return { ok: true, savedAt: new Date().toISOString() }
}

export async function uploadContractDocuments(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const opportunityId = String(formData.get('opportunityId') ?? '').trim()
  if (!opportunityId) {
    redirect('/opportunities?error=Missing%20opportunity%20for%20document%20upload')
  }

  const files = formData
    .getAll('contractDocuments')
    .filter((item): item is File => item instanceof File && item.size > 0 && item.name.trim().length > 0)

  if (files.length === 0) {
    redirect(`/proposal-prep/${opportunityId}?error=Select%20at%20least%20one%20document%20to%20upload`)
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.is_anonymous) {
    redirect('/dashboard?error=Sign%20in%20to%20upload%20contract%20documents')
  }

  const { data: company } = await supabase.from('companies').select('id').eq('owner_user_id', user.id).maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const rows = [] as Array<{
    company_id: string
    opportunity_id: string
    file_name: string
    mime_type: string | null
    extracted_text: string
  }>

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      redirect(`/proposal-prep/${opportunityId}?error=${encodeURIComponent(`${file.name} exceeds the 5MB upload limit`)}`)
    }

    const mimeType = file.type || null
    const extraction = await extractTextFromUploadedDocument(file)

    rows.push({
      company_id: company.id,
      opportunity_id: opportunityId,
      file_name: file.name,
      mime_type: mimeType,
      extracted_text: extraction.text,
    })
  }

  const { error } = await supabase.from('proposal_contract_documents').insert(rows)
  if (error) {
    redirect(`/proposal-prep/${opportunityId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/proposal-prep/${opportunityId}?message=${encodeURIComponent(`Uploaded ${rows.length} document${rows.length === 1 ? '' : 's'}`)}`)
}

type AiDraftActionResult = {
  ok: boolean
  error?: string
  savedAt?: string
  draft?: {
    proposalSummary: string
    responseStrategy: string
    complianceChecklist: string
    riskNotes: string
    exportReady: boolean
    proposalSections: ProposalDraftRow['proposal_sections']
  }
}

export async function generateAiProposalDraft(opportunityId: string): Promise<AiDraftActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured yet' }
  }

  if (!opportunityId?.trim()) {
    return { ok: false, error: 'Missing opportunity for AI draft generation' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Please sign in again' }
  }

  if (user.is_anonymous) {
    return { ok: false, error: 'Sign in to generate proposal drafts' }
  }

  const workspace = await loadProposalWorkspaceData(supabase, user.id, opportunityId)
  if (!workspace) {
    return { ok: false, error: 'Proposal workspace not found' }
  }

  const aiConfig = getConfiguredAiProviderModel()
  const aiDraftStartedAt = Date.now()

  const generated = await generateProposalDraftContent({
    companyName: workspace.companyName,
    companyProfile: {
      capabilityStatement: workspace.companyProfile.capabilityStatement,
      certifications: workspace.companyProfile.certifications,
      teamSize: workspace.companyProfile.teamSize,
      geographicCoverage: workspace.companyProfile.geographicCoverage,
      keywords: workspace.companyProfile.keywords,
      naicsCodes: workspace.companyProfile.naicsCodes,
      pscCodes: workspace.companyProfile.pscCodes,
    },
    opportunity: {
      title: workspace.opportunity.title,
      agency: workspace.opportunity.agency,
      synopsis: workspace.opportunity.synopsis,
      summaryText: workspace.brief.summaryText,
      responseDeadlineAt: workspace.opportunity.response_deadline_at,
    },
    research: workspace.research,
    awardHistorySummary: workspace.brief.awardHistory?.summaryText ?? null,
    questions: workspace.questions,
    uploadedDocuments: workspace.contractDocuments.map((document) => ({
      fileName: document.file_name,
      mimeType: document.mime_type,
      extractedText: document.extracted_text,
      uploadedAt: document.uploaded_at,
    })),
  })

  const payload = {
    company_id: workspace.companyId,
    opportunity_id: workspace.opportunityId,
    proposal_summary: generated.proposalSummary,
    response_strategy: generated.responseStrategy,
    compliance_checklist: generated.complianceChecklist,
    risk_notes: generated.riskNotes,
    question_answers: workspace.draft?.question_answers ?? [],
    export_ready: false,
    proposal_sections: normalizeProposalSections(generated.proposalSections),
  }

  const { error } = await supabase.from('proposal_drafts').upsert(payload, { onConflict: 'company_id,opportunity_id' })

  if (error) {
    await logUsageEvent({
      actorUserId: user.id,
      companyId: workspace.companyId,
      opportunityId: workspace.opportunityId,
      action: 'ai.proposal_draft',
      provider: aiConfig.provider,
      model: aiConfig.model,
      status: 'error',
      durationMs: Date.now() - aiDraftStartedAt,
      metadata: {
        aiConfigured: aiConfig.configured,
        reason: 'draft_upsert_failed',
        error: error.message,
      },
    })

    return { ok: false, error: error.message }
  }

  await logUsageEvent({
    actorUserId: user.id,
    companyId: workspace.companyId,
    opportunityId: workspace.opportunityId,
    action: 'ai.proposal_draft',
    provider: aiConfig.provider,
    model: aiConfig.model,
    status: 'success',
    durationMs: Date.now() - aiDraftStartedAt,
    metadata: {
      aiConfigured: aiConfig.configured,
      uploadedDocumentCount: workspace.contractDocuments.length,
      extractedDocumentCount: workspace.contractDocuments.filter((item) => item.extracted_text.trim().length > 0).length,
      questionCount: workspace.questions.length,
      exportReadyReset: true,
    },
  })

  return {
    ok: true,
    savedAt: new Date().toISOString(),
    draft: {
      proposalSummary: generated.proposalSummary,
      responseStrategy: generated.responseStrategy,
      complianceChecklist: generated.complianceChecklist,
      riskNotes: generated.riskNotes,
      exportReady: false,
      proposalSections: normalizeProposalSections(generated.proposalSections),
    },
  }
}
