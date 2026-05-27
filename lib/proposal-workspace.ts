import type { SupabaseClient } from '@supabase/supabase-js'
import { buildProposalPrepBrief } from '@/lib/proposal-prep'
import { generateOpportunityResearch, generateProposalQuestions, type ProposalQuestion } from '@/lib/proposal-research'
import { getConfiguredAiProviderModel, logUsageEvent } from '@/lib/usage-events'

export type ProposalSectionItem = {
  title: string
  detail: string
  evidence: string
}

export type ProposalPastPerformanceClaim = {
  claim: string
  evidence: string
  relevance: string
}

export type ProposalSectionsDraft = {
  scope: ProposalSectionItem[]
  approach: ProposalSectionItem[]
  pastPerformanceClaims: ProposalPastPerformanceClaim[]
}

export type ProposalDraftRow = {
  proposal_summary: string
  response_strategy: string
  compliance_checklist: string
  risk_notes: string
  question_answers: Array<{ question: string; answer: string }>
  export_ready: boolean
  proposal_sections: ProposalSectionsDraft
}

export type ProposalWorkspaceData = {
  companyId: string
  companyName: string
  companyProfile: {
    capabilityStatement: string | null
    certifications: string[]
    teamSize: string | null
    geographicCoverage: string | null
    keywords: string[]
    naicsCodes: string[]
    pscCodes: string[]
  }
  opportunityId: string
  opportunity: {
    id: string
    source_notice_id: string
    title: string
    synopsis: string | null
    agency: string | null
    naics_code: string | null
    psc_code: string | null
    posted_at: string | null
    response_deadline_at: string | null
    notice_url: string | null
    raw_payload: Record<string, unknown> | null
  }
  brief: ReturnType<typeof buildProposalPrepBrief>
  research: Awaited<ReturnType<typeof generateOpportunityResearch>>
  questions: ProposalQuestion[]
  contractDocuments: Array<{
    id: string
    file_name: string
    mime_type: string | null
    extracted_text: string
    uploaded_at: string
  }>
  draft: ProposalDraftRow | null
}

export function createEmptyProposalSections(): ProposalSectionsDraft {
  return {
    scope: [],
    approach: [],
    pastPerformanceClaims: [],
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function normalizeSectionItem(item: unknown): ProposalSectionItem | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const title = isString(record.title) ? record.title.trim() : ''
  const detail = isString(record.detail) ? record.detail.trim() : ''
  const evidence = isString(record.evidence) ? record.evidence.trim() : ''

  if (!title && !detail && !evidence) {
    return null
  }

  return { title, detail, evidence }
}

function normalizePastPerformanceClaim(item: unknown): ProposalPastPerformanceClaim | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const claim = isString(record.claim) ? record.claim.trim() : ''
  const evidence = isString(record.evidence) ? record.evidence.trim() : ''
  const relevance = isString(record.relevance) ? record.relevance.trim() : ''

  if (!claim && !evidence && !relevance) {
    return null
  }

  return { claim, evidence, relevance }
}

export function normalizeProposalSections(sections: unknown): ProposalSectionsDraft {
  if (!sections || typeof sections !== 'object') {
    return createEmptyProposalSections()
  }

  const record = sections as Record<string, unknown>

  return {
    scope: Array.isArray(record.scope) ? record.scope.map(normalizeSectionItem).filter((item): item is ProposalSectionItem => item !== null) : [],
    approach: Array.isArray(record.approach) ? record.approach.map(normalizeSectionItem).filter((item): item is ProposalSectionItem => item !== null) : [],
    pastPerformanceClaims: Array.isArray(record.pastPerformanceClaims)
      ? record.pastPerformanceClaims.map(normalizePastPerformanceClaim).filter((item): item is ProposalPastPerformanceClaim => item !== null)
      : [],
  }
}

function splitCsv(values: string[] | null | undefined) {
  return values ?? []
}

export async function loadProposalWorkspaceData(supabase: SupabaseClient, userId: string, opportunityId: string): Promise<ProposalWorkspaceData | null> {
  const { data: company } = await supabase.from('companies').select('id, name').eq('owner_user_id', userId).maybeSingle()
  if (!company) {
    return null
  }

  const [{ data: profile }, { data: naicsLinks }, { data: pscLinks }, { data: opportunity }, { data: summary }, { data: awardHistory }, { data: contractDocuments }, { data: draft }] = await Promise.all([
    supabase
      .from('company_profiles')
      .select('capability_statement, certifications, team_size, geographic_coverage, preferred_agencies, keywords, excluded_industries')
      .eq('company_id', company.id)
      .maybeSingle(),
    supabase.from('company_naics_codes').select('naics_code').eq('company_id', company.id).order('naics_code', { ascending: true }),
    supabase.from('company_psc_codes').select('psc_code').eq('company_id', company.id).order('psc_code', { ascending: true }),
    supabase
      .from('opportunities')
      .select('id, source_notice_id, title, synopsis, agency, naics_code, psc_code, posted_at, response_deadline_at, notice_url, raw_payload')
      .eq('id', opportunityId)
      .maybeSingle(),
    supabase.from('opportunity_summaries').select('summary_text, key_points, pursue_steps').eq('opportunity_id', opportunityId).maybeSingle(),
    supabase
      .from('opportunity_award_intelligence')
      .select('summary_text, award_count, incumbent_vendor, last_award_date, total_award_value, rebid_signal')
      .eq('opportunity_id', opportunityId)
      .maybeSingle(),
    supabase
      .from('proposal_contract_documents')
      .select('id, file_name, mime_type, extracted_text, uploaded_at')
      .eq('company_id', company.id)
      .eq('opportunity_id', opportunityId)
      .order('uploaded_at', { ascending: false })
      .limit(12),
    supabase
      .from('proposal_drafts')
      .select('proposal_summary, response_strategy, compliance_checklist, risk_notes, question_answers, export_ready, proposal_sections')
      .eq('company_id', company.id)
      .eq('opportunity_id', opportunityId)
      .maybeSingle(),
  ])

  if (!opportunity) {
    return null
  }

  const aiConfig = getConfiguredAiProviderModel()
  const aiWorkspaceStartedAt = Date.now()

  const research = await generateOpportunityResearch({
    opportunityTitle: opportunity.title,
    agency: opportunity.agency,
    synopsis: opportunity.synopsis,
    summaryText: summary?.summary_text ?? null,
    rawPayload: (opportunity.raw_payload as Record<string, unknown> | null) ?? null,
  })

  const brief = buildProposalPrepBrief({
    companyName: company.name,
    profile: {
      companyName: company.name,
      website: null,
      capabilityStatement: profile?.capability_statement ?? null,
      teamSize: profile?.team_size ?? null,
      geographicCoverage: profile?.geographic_coverage ?? null,
      certifications: splitCsv(profile?.certifications),
      preferredAgencies: splitCsv(profile?.preferred_agencies),
      keywords: splitCsv(profile?.keywords),
      excludedIndustries: splitCsv(profile?.excluded_industries),
      naicsCodes: (naicsLinks ?? []).map((item) => item.naics_code),
      pscCodes: (pscLinks ?? []).map((item) => item.psc_code),
    },
    opportunity: {
      title: opportunity.title,
      agency: opportunity.agency,
      synopsis: opportunity.synopsis,
      noticeUrl: opportunity.notice_url,
      postedAt: opportunity.posted_at,
      responseDeadlineAt: opportunity.response_deadline_at,
      naicsCode: opportunity.naics_code,
      pscCode: opportunity.psc_code,
    },
    research,
    summary: summary
      ? {
          summaryText: summary.summary_text,
          keyPoints: summary.key_points ?? [],
          pursueSteps: summary.pursue_steps ?? [],
        }
      : null,
    awardHistory: awardHistory
      ? {
          summaryText: awardHistory.summary_text,
          awardCount: awardHistory.award_count,
          incumbentVendor: awardHistory.incumbent_vendor,
          lastAwardDate: awardHistory.last_award_date,
          totalAwardValue: awardHistory.total_award_value,
          rebidSignal: awardHistory.rebid_signal,
        }
      : null,
  })

  const storedQuestions = ((draft?.question_answers as Array<{ question: string; answer: string }> | null) ?? [])
    .map((item) => item.question?.trim())
    .filter((item): item is string => Boolean(item))

  const effectiveQuestions: ProposalQuestion[] =
    storedQuestions.length > 0
      ? storedQuestions.map((question) => ({
          question,
          rationale: 'Restored from the saved draft for continuity.',
        }))
      : await generateProposalQuestions({
          opportunityTitle: opportunity.title,
          agency: opportunity.agency,
          synopsis: opportunity.synopsis,
          summaryText: summary?.summary_text ?? null,
          rawPayload: (opportunity.raw_payload as Record<string, unknown> | null) ?? null,
          research,
        })

  await logUsageEvent({
    actorUserId: userId,
    companyId: company.id,
    opportunityId,
    action: 'ai.workspace_analysis',
    provider: aiConfig.provider,
    model: aiConfig.model,
    status: 'success',
    durationMs: Date.now() - aiWorkspaceStartedAt,
    metadata: {
      aiConfigured: aiConfig.configured,
      questionCount: effectiveQuestions.length,
      contactCount: research.contacts.length,
      attachmentCount: research.attachments.length,
      apiSectionCounts: {
        solicitationDetails: research.apiSections.solicitationDetails.length,
        classification: research.apiSections.classification.length,
        description: research.apiSections.description.length,
        contactInformation: research.apiSections.contactInformation.length,
        attachmentsLinks: research.apiSections.attachmentsLinks.length,
      },
    },
  })

  return {
    companyId: company.id,
    companyName: company.name,
    companyProfile: {
      capabilityStatement: profile?.capability_statement ?? null,
      certifications: splitCsv(profile?.certifications),
      teamSize: profile?.team_size ?? null,
      geographicCoverage: profile?.geographic_coverage ?? null,
      keywords: splitCsv(profile?.keywords),
      naicsCodes: (naicsLinks ?? []).map((item) => item.naics_code),
      pscCodes: (pscLinks ?? []).map((item) => item.psc_code),
    },
    opportunityId,
    opportunity: {
      id: opportunity.id,
      source_notice_id: opportunity.source_notice_id,
      title: opportunity.title,
      synopsis: opportunity.synopsis,
      agency: opportunity.agency,
      naics_code: opportunity.naics_code,
      psc_code: opportunity.psc_code,
      posted_at: opportunity.posted_at,
      response_deadline_at: opportunity.response_deadline_at,
      notice_url: opportunity.notice_url,
      raw_payload: (opportunity.raw_payload as Record<string, unknown> | null) ?? null,
    },
    brief,
    research,
    questions: effectiveQuestions,
    contractDocuments:
      (contractDocuments ?? []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        mime_type: doc.mime_type,
        extracted_text: doc.extracted_text,
        uploaded_at: doc.uploaded_at,
      })) ?? [],
    draft:
      draft
        ? {
            proposal_summary: draft.proposal_summary,
            response_strategy: draft.response_strategy,
            compliance_checklist: draft.compliance_checklist,
            risk_notes: draft.risk_notes,
            question_answers: (draft.question_answers as Array<{ question: string; answer: string }>) ?? [],
            export_ready: draft.export_ready,
            proposal_sections: normalizeProposalSections(draft.proposal_sections),
          }
        : null,
  }
}
