type ProposalPrepProfile = {
  companyName: string
  website: string | null
  capabilityStatement: string | null
  teamSize: string | null
  geographicCoverage: string | null
  certifications: string[]
  preferredAgencies: string[]
  keywords: string[]
  excludedIndustries: string[]
  naicsCodes: string[]
  pscCodes: string[]
}

type ProposalPrepOpportunity = {
  title: string
  agency: string | null
  synopsis: string | null
  noticeUrl: string | null
  postedAt: string | null
  responseDeadlineAt: string | null
  naicsCode: string | null
  pscCode: string | null
}

type ProposalPrepSummary = {
  summaryText: string | null
  keyPoints: string[]
  pursueSteps: string[]
}

type ProposalPrepAwardHistory = {
  summaryText: string | null
  awardCount: number
  incumbentVendor: string | null
  lastAwardDate: string | null
  totalAwardValue: number | null
  rebidSignal: string | null
} | null

type ProposalPrepResearch = {
  aiSummary: string | null
  recommendedDocuments: string[]
  contactEmails: string[]
  contacts: Array<{
    name: string | null
    role: string | null
    email: string | null
    phone: string | null
  }>
  attachments: Array<{
    title: string | null
    url: string | null
    type: string | null
  }>
  missingDocumentSignals: string[]
}

type ProposalPrepInput = {
  companyName: string
  profile: ProposalPrepProfile
  opportunity: ProposalPrepOpportunity
  research: ProposalPrepResearch
  summary: ProposalPrepSummary | null
  awardHistory: ProposalPrepAwardHistory
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0)
}

export function buildProposalPrepBrief({ companyName, profile, opportunity, research, summary, awardHistory }: ProposalPrepInput) {
  const missingCompanyInputs = [
    !hasText(profile.website) ? 'Company website is missing.' : null,
    !hasText(profile.capabilityStatement) ? 'Capability statement is missing.' : null,
    profile.certifications.length === 0 ? 'No certifications recorded.' : null,
    !hasText(profile.teamSize) ? 'Team size is not set.' : null,
    !hasText(profile.geographicCoverage) ? 'Geographic coverage is not set.' : null,
    profile.naicsCodes.length === 0 ? 'No NAICS codes are configured.' : null,
    profile.pscCodes.length === 0 ? 'No PSC codes are configured.' : null,
  ].filter((item): item is string => Boolean(item))

  const opportunityInputs = [
    opportunity.naicsCode ? `NAICS ${opportunity.naicsCode}` : null,
    opportunity.pscCode ? `PSC ${opportunity.pscCode}` : null,
    opportunity.agency ? `Agency: ${opportunity.agency}` : null,
    awardHistory?.incumbentVendor ? `Incumbent: ${awardHistory.incumbentVendor}` : null,
  ].filter((item): item is string => Boolean(item))

  const winThemes = [
    profile.naicsCodes.length > 0 ? `Emphasize existing NAICS coverage: ${profile.naicsCodes.join(', ')}.` : 'Add the relevant NAICS code before drafting a response.',
    profile.pscCodes.length > 0 ? `Reference PSC experience: ${profile.pscCodes.join(', ')}.` : 'Capture PSC alignment before the draft is finalized.',
    profile.certifications.length > 0 ? `Surface certifications only if directly supported: ${profile.certifications.join(', ')}.` : 'Verify any certifications before mentioning them.',
    profile.keywords.length > 0 ? `Mirror confirmed keywords in the narrative: ${profile.keywords.slice(0, 5).join(', ')}.` : 'Gather opportunity-specific keywords from the solicitation.',
  ]

  const outline = [
    'Executive summary: why the company is a credible fit for this notice.',
    'Relevant experience: only verified projects, capabilities, and certifications.',
    'Technical approach: response structure, staffing, and delivery method.',
    'Compliance checklist: deadline, format, attachments, and submission portal.',
    'Risk notes: any missing evidence that must be resolved before submission.',
  ]

  const reviewerNotes = [
    'This page is a preparation aid, not a proposal submission engine.',
    'Never invent past performance, certifications, pricing, or staffing.',
    'Flag any missing proof so a human can verify it before drafting.',
  ]

  return {
    companyName,
    title: opportunity.title,
    agency: opportunity.agency ?? 'Agency not provided',
    noticeUrl: opportunity.noticeUrl,
    postedAt: opportunity.postedAt,
    responseDeadlineAt: opportunity.responseDeadlineAt,
    summaryText: summary?.summaryText ?? opportunity.synopsis ?? 'No synopsis provided.',
    keyPoints: summary?.keyPoints ?? [],
    pursueSteps: summary?.pursueSteps ?? [],
    awardHistory,
    research,
    missingCompanyInputs,
    opportunityInputs,
    winThemes,
    outline,
    reviewerNotes,
  }
}
