type RawPayload = Record<string, unknown>

export type OpportunityContact = {
  name: string | null
  role: string | null
  email: string | null
  phone: string | null
}

export type OpportunityAttachment = {
  title: string | null
  url: string | null
  type: string | null
}

export type OpportunityResearchMetadata = {
  contacts: OpportunityContact[]
  attachments: OpportunityAttachment[]
  sourceHints: string[]
}

export type OpportunityResearchResult = {
  aiSummary: string | null
  recommendedDocuments: string[]
  contactEmails: string[]
  contacts: OpportunityContact[]
  attachments: OpportunityAttachment[]
  missingDocumentSignals: string[]
  apiSections: {
    solicitationDetails: string[]
    classification: string[]
    description: string[]
    contactInformation: string[]
    attachmentsLinks: string[]
    criticalInstructions: string[]
  }
}

export type ProposalQuestion = {
  question: string
  rationale: string
}

type ResearchInput = {
  opportunityTitle: string
  agency: string | null
  synopsis: string | null
  summaryText: string | null
  rawPayload: RawPayload | null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cleanText(value: unknown) {
  return hasText(value) ? value.trim() : null
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function isEmail(value: unknown) {
  return hasText(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isLikelyUrl(value: unknown) {
  return hasText(value) && /^(https?:)?\/\//i.test(value)
}

function isAttachmentLike(node: RawPayload) {
  return Boolean(
    cleanText(node.fileName) ||
      cleanText(node.filename) ||
      cleanText(node.name) ||
      cleanText(node.title) ||
      cleanText(node.documentName) ||
      cleanText(node.url) ||
      cleanText(node.downloadUrl) ||
      cleanText(node.link),
  )
}

function visitNodes(value: unknown, visit: (node: RawPayload, path: string[]) => void, path: string[] = []) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitNodes(item, visit, [...path, String(index)]))
    return
  }

  const node = value as RawPayload
  visit(node, path)

  Object.entries(node).forEach(([key, child]) => {
    if (child && typeof child === 'object') {
      visitNodes(child, visit, [...path, key])
    }
  })
}

export function extractOpportunityResearchMetadata(rawPayload: RawPayload | null): OpportunityResearchMetadata {
  const contacts: OpportunityContact[] = []
  const attachments: OpportunityAttachment[] = []
  const sourceHints: string[] = []

  if (!rawPayload) {
    return { contacts, attachments, sourceHints }
  }

  visitNodes(rawPayload, (node, path) => {
    const name = cleanText(node.name) ?? cleanText(node.contactName) ?? cleanText(node.fullName) ?? cleanText(node.personName)
    const role = cleanText(node.role) ?? cleanText(node.contactType) ?? cleanText(node.title) ?? cleanText(node.position)
    const email =
      cleanText(node.email) ??
      cleanText(node.emailAddress) ??
      cleanText(node.email_address) ??
      cleanText(node.contactEmail) ??
      cleanText(node.pointOfContactEmail)
    const phone = cleanText(node.phone) ?? cleanText(node.phoneNumber) ?? cleanText(node.telephone) ?? cleanText(node.contactPhone)

    if (name || role || email || phone) {
      contacts.push({ name, role, email: isEmail(email) ? email : null, phone })
      sourceHints.push(path.join('.') || 'root')
    }

    if (isAttachmentLike(node)) {
      const title = cleanText(node.fileName) ?? cleanText(node.filename) ?? cleanText(node.name) ?? cleanText(node.title) ?? cleanText(node.documentName)
      const url = cleanText(node.url) ?? cleanText(node.downloadUrl) ?? cleanText(node.link)
      const type = cleanText(node.type) ?? cleanText(node.documentType) ?? cleanText(node.mimeType)

      attachments.push({ title, url: isLikelyUrl(url) ? url : null, type })
      sourceHints.push(path.join('.') || 'root')
    }
  })

  const dedupedContacts = dedupeByKey(
    contacts.filter((contact) => contact.name || contact.role || contact.email || contact.phone),
    (contact) => `${contact.name ?? ''}|${contact.role ?? ''}|${contact.email ?? ''}|${contact.phone ?? ''}`,
  )

  const dedupedAttachments = dedupeByKey(
    attachments.filter((attachment) => attachment.title || attachment.url),
    (attachment) => `${attachment.title ?? ''}|${attachment.url ?? ''}|${attachment.type ?? ''}`,
  )

  return {
    contacts: dedupedContacts,
    attachments: dedupedAttachments,
    sourceHints: dedupeByKey(sourceHints, (hint) => hint),
  }
}

function truncate(value: string, max = 4000) {
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max - 1)}…`
}

function dedupeNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function extractLongestNarrativeText(value: unknown): string | null {
  const candidates: string[] = []

  const visit = (node: unknown) => {
    if (!node) {
      return
    }

    if (typeof node === 'string') {
      const text = normalizeSnippet(node)
      if (text.length >= 80 && !isLikelyUrl(text)) {
        candidates.push(text)
      }
      return
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item))
      return
    }

    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach((item) => visit(item))
    }
  }

  visit(value)
  const longest = candidates.sort((left, right) => right.length - left.length)[0] ?? null
  return longest ? longest.slice(0, 12000) : null
}

async function resolveNoticeDescriptionText(rawPayload: RawPayload | null): Promise<string | null> {
  if (!rawPayload) {
    return null
  }

  const existingText = cleanText(rawPayload.noticeDescriptionText)
  if (existingText && !isLikelyUrl(existingText)) {
    return existingText
  }

  const descriptionUrlCandidates = [
    cleanText(rawPayload.description),
    cleanText(rawPayload.noticeDescriptionUrl),
    cleanText(rawPayload.noticeDescUrl),
  ].filter((value): value is string => Boolean(value && isLikelyUrl(value)))

  const descriptionUrl = descriptionUrlCandidates[0]
  if (!descriptionUrl || !descriptionUrl.toLowerCase().includes('noticedesc')) {
    return null
  }

  try {
    const apiKey = process.env.SAM_GOV_API_KEY
    const url = new URL(descriptionUrl)
    if (apiKey && !url.searchParams.get('api_key')) {
      url.searchParams.set('api_key', apiKey)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timeout))
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as unknown
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const objectPayload = payload as Record<string, unknown>
    const directCandidates = [
      cleanText(objectPayload.description),
      cleanText(objectPayload.synopsis),
      cleanText(objectPayload.noticeDescription),
      cleanText(objectPayload.noticeText),
      cleanText(objectPayload.content),
    ].filter((value): value is string => Boolean(value && !isLikelyUrl(value)))

    if (directCandidates.length > 0) {
      return directCandidates.sort((left, right) => right.length - left.length)[0]
    }

    return extractLongestNarrativeText(objectPayload)
  } catch {
    return null
  }
}

async function enrichResearchInput(input: ResearchInput): Promise<ResearchInput> {
  if (!input.rawPayload) {
    return input
  }

  const synopsisLooksMissing = !input.synopsis || isLikelyUrl(input.synopsis) || input.synopsis.trim().length < 120
  if (!synopsisLooksMissing) {
    return input
  }

  const resolvedDescription = await resolveNoticeDescriptionText(input.rawPayload)
  if (!resolvedDescription) {
    return input
  }

  return {
    ...input,
    synopsis: synopsisLooksMissing ? resolvedDescription : input.synopsis,
    rawPayload: {
      ...input.rawPayload,
      noticeDescriptionText: resolvedDescription,
    },
  }
}

function extractCriticalInstructions(values: string[]) {
  const snippets = dedupeNonEmpty(values)
    .flatMap((item) => item.split(/\r?\n|(?<=[.!?])\s+/g))
    .map((item) => normalizeSnippet(item))
    .filter((item) => item.length >= 18 && item.length <= 280)

  const patterns = [
    /\bnot\s+(?:a\s+)?request\s+for\s+quotes?\b/i,
    /\bnot\s+an?\s+rfq\b/i,
    /\bquotes?.*\bnot\b.*\b(?:accepted|reviewed)\b/i,
    /\bcapability\s+statement(?:s)?\b/i,
    /\bsubject\s+line\b/i,
    /\b(?:all\s+)?correspondence\b/i,
    /\b(?:sow|pws|statement of work|performance work statement)\b/i,
    /\b(?:reference|include)\s+(?:id|solicitation|notice)\b/i,
  ]

  return dedupeNonEmpty(
    snippets.filter((snippet) => patterns.some((pattern) => pattern.test(snippet))),
  ).slice(0, 20)
}

function extractApiSections(rawPayload: RawPayload | null, metadata: OpportunityResearchMetadata, synopsis?: string | null, summaryText?: string | null) {
  const solicitationDetails: string[] = []
  const classification: string[] = []
  const description: string[] = []
  const contactInformation: string[] = []
  const attachmentsLinks: string[] = []

  if (rawPayload) {
    visitNodes(rawPayload, (node) => {
      Object.entries(node).forEach(([key, value]) => {
        const normalizedKey = key.toLowerCase()
        const pushValue = (target: string[], label: string, inputValue: unknown, options?: { allowUrl?: boolean }) => {
          const allowUrl = options?.allowUrl ?? true
          if (typeof inputValue === 'string' && inputValue.trim().length > 0) {
            const normalizedValue = normalizeSnippet(inputValue)
            if (!allowUrl && isLikelyUrl(normalizedValue)) {
              return
            }

            target.push(`${label}: ${normalizedValue.slice(0, 2000)}`)
          }
        }

        if (/solicitation|noticeid|solicitationnumber|notice|setaside|posteddate|responsedeadline|response/i.test(normalizedKey)) {
          pushValue(solicitationDetails, key, value)
        }

        if (/naics|psc|classification|productservice|code|setaside|type/i.test(normalizedKey)) {
          pushValue(classification, key, value)
        }

        if (/description|synopsis|scope|requirements|statementofwork|pws|sow|performance/i.test(normalizedKey)) {
          pushValue(description, key, value, { allowUrl: false })
        }

        if (/contact|email|phone|officer|pointofcontact|telephone/i.test(normalizedKey)) {
          pushValue(contactInformation, key, value)
        }

        if (/attachment|document|link|url|download/i.test(normalizedKey)) {
          pushValue(attachmentsLinks, key, value)
        }
      })
    })

    const noticeDescriptionText = cleanText(rawPayload.noticeDescriptionText)
    if (noticeDescriptionText && !isLikelyUrl(noticeDescriptionText)) {
      description.push(`noticeDescriptionText: ${normalizeSnippet(noticeDescriptionText).slice(0, 2000)}`)
    }
  }

  metadata.contacts.forEach((contact) => {
    const parts = [contact.name, contact.role, contact.email, contact.phone].filter((value): value is string => Boolean(value?.trim()))
    if (parts.length > 0) {
      contactInformation.push(parts.join(' | '))
    }
  })

  metadata.attachments.forEach((attachment) => {
    const label = attachment.title ?? 'Attachment'
    const link = attachment.url ? ` (${attachment.url})` : ''
    const type = attachment.type ? ` [${attachment.type}]` : ''
    attachmentsLinks.push(`${label}${type}${link}`)
  })

  const criticalInstructions = extractCriticalInstructions([
    synopsis ?? '',
    summaryText ?? '',
    ...description,
    ...solicitationDetails,
  ])

  return {
    solicitationDetails: dedupeNonEmpty(solicitationDetails).slice(0, 40),
    classification: dedupeNonEmpty(classification).slice(0, 40),
    description: dedupeNonEmpty(description).slice(0, 80),
    contactInformation: dedupeNonEmpty(contactInformation).slice(0, 40),
    attachmentsLinks: dedupeNonEmpty(attachmentsLinks).slice(0, 60),
    criticalInstructions,
  }
}

function buildFallbackResearch(input: ResearchInput, metadata: OpportunityResearchMetadata): OpportunityResearchResult {
  const apiSections = extractApiSections(input.rawPayload, metadata, input.synopsis, input.summaryText)
  const contactEmails = metadata.contacts.map((contact) => contact.email).filter((email): email is string => Boolean(email))
  const recommendedDocuments = metadata.attachments.map((attachment) => attachment.title ?? attachment.url ?? 'Unnamed document')

  const missingDocumentSignals = [
    metadata.attachments.length === 0 ? 'No attachment metadata was found in the SAM payload.' : null,
    contactEmails.length === 0 ? 'No contact email was found in the SAM payload.' : null,
    !input.synopsis ? 'The opportunity synopsis is missing, so the notice should be opened directly.' : null,
  ].filter((item): item is string => Boolean(item))

  const aiSummary = [
    `Research prep for ${input.opportunityTitle}.`,
    input.agency ? `Agency: ${input.agency}.` : null,
    input.summaryText ? input.summaryText : input.synopsis ?? null,
    contactEmails.length > 0 ? `Potential contact emails: ${contactEmails.join(', ')}.` : 'No contact email was extracted from the raw notice payload.',
    recommendedDocuments.length > 0
      ? `Likely supporting documents: ${recommendedDocuments.slice(0, 5).join(', ')}.`
      : 'No supporting documents were extracted from the raw notice payload.',
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ')

  return {
    aiSummary,
    recommendedDocuments,
    contactEmails,
    contacts: metadata.contacts,
    attachments: metadata.attachments,
    missingDocumentSignals,
    apiSections,
  }
}

async function callAiResearch(input: ResearchInput, metadata: OpportunityResearchMetadata): Promise<string | null> {
  const provider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()

  if (provider === 'claude' || provider === 'anthropic' || process.env.CLAUDE_API_KEY) {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) {
      return null
    }

    const apiUrl = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages'
    const model = process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022'

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.2,
        system:
          'You are helping a federal proposal team research a SAM.gov opportunity. Use only the provided data. Do not invent contacts, documents, qualifications, or pricing. Return concise notes with: 1) a short research summary, 2) contact email(s) if present, 3) documents needed or mentioned, and 4) what is still missing.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify(
              {
                opportunityTitle: input.opportunityTitle,
                agency: input.agency,
                synopsis: truncate(input.synopsis ?? '', 2000),
                summaryText: truncate(input.summaryText ?? '', 2000),
                contacts: metadata.contacts,
                attachments: metadata.attachments,
                apiSections: extractApiSections(input.rawPayload, metadata, input.synopsis, input.summaryText),
              },
              null,
              2,
            ),
          },
        ],
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    const result = (await response.json()) as {
      content?: Array<{
        type?: string
        text?: string
      }>
    }

    return result.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n').trim() || null
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return null
  }

  const apiUrl = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions'
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are helping a federal proposal team research a SAM.gov opportunity. Use only the provided data. Do not invent contacts, documents, qualifications, or pricing. Return concise notes with: 1) a short research summary, 2) contact email(s) if present, 3) documents needed or mentioned, and 4) what is still missing.',
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              opportunityTitle: input.opportunityTitle,
              agency: input.agency,
              synopsis: truncate(input.synopsis ?? '', 2000),
              summaryText: truncate(input.summaryText ?? '', 2000),
              contacts: metadata.contacts,
              attachments: metadata.attachments,
              apiSections: extractApiSections(input.rawPayload, metadata, input.synopsis, input.summaryText),
            },
            null,
            2,
          ),
        },
      ],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const result = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
      }
    }>
  }

  return result.choices?.[0]?.message?.content?.trim() ?? null
}

export async function generateOpportunityResearch(input: ResearchInput): Promise<OpportunityResearchResult> {
  const enrichedInput = await enrichResearchInput(input)
  const metadata = extractOpportunityResearchMetadata(enrichedInput.rawPayload)
  const apiSections = extractApiSections(enrichedInput.rawPayload, metadata, enrichedInput.synopsis, enrichedInput.summaryText)
  const aiSummary = await callAiResearch(enrichedInput, metadata)

  if (!aiSummary) {
    return buildFallbackResearch(enrichedInput, metadata)
  }

  const contactEmails = metadata.contacts.map((contact) => contact.email).filter((email): email is string => Boolean(email))
  const recommendedDocuments = metadata.attachments.map((attachment) => attachment.title ?? attachment.url ?? 'Unnamed document')

  return {
    aiSummary,
    recommendedDocuments,
    contactEmails,
    contacts: metadata.contacts,
    attachments: metadata.attachments,
    missingDocumentSignals: [
      metadata.attachments.length === 0 ? 'No attachment metadata was found in the raw notice payload.' : null,
      contactEmails.length === 0 ? 'No contact email was found in the raw notice payload.' : null,
    ].filter((item): item is string => Boolean(item)),
    apiSections,
  }
}

type ProposalQuestionInput = ResearchInput & {
  research: OpportunityResearchResult
}

function fallbackProposalQuestions(input: ProposalQuestionInput): ProposalQuestion[] {
  const questions: ProposalQuestion[] = [
    {
      question: `What verified experience does ${input.opportunityTitle} most closely align with?`,
      rationale: 'This keeps the draft anchored to proven past performance instead of assumptions.',
    },
    {
      question: 'Which compliance documents and attachments are required before submission?',
      rationale: 'The proposal should not move forward until the required package is fully known.',
    },
    {
      question: 'Who is the point of contact and what is the best confirmed email for questions?',
      rationale: 'Research should surface a real contact path before any outreach is made.',
    },
    {
      question: 'Which certifications, NAICS, PSC, or teaming relationships can be explicitly verified?',
      rationale: 'Only verified qualifications should be cited in proposal material.',
    },
    {
      question: 'What are the biggest open risks or missing inputs before drafting the response?',
      rationale: 'This helps the user fill critical gaps before writing begins.',
    },
  ]

  if (input.research.attachments.length === 0) {
    questions.push({
      question: 'Are there attachments hidden behind the SAM notice page that should be downloaded manually?',
      rationale: 'Some solicitations list separate attachments or amendments outside the raw payload.',
    })
  }

  if (input.research.apiSections.criticalInstructions.length > 0) {
    questions.push({
      question: 'Which critical solicitation instructions (reference IDs, subject lines, or quote restrictions) were copied into the compliance checklist?',
      rationale: 'Critical instructions are easy to miss and can disqualify an otherwise strong submission.',
    })
  }

  return questions
}

async function callAiProposalQuestions(input: ProposalQuestionInput): Promise<ProposalQuestion[] | null> {
  const provider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  const apiKey = provider === 'claude' || provider === 'anthropic' || process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY : process.env.OPENAI_API_KEY

  if (!apiKey) {
    return null
  }

  const usingClaude = Boolean(provider === 'claude' || provider === 'anthropic' || process.env.CLAUDE_API_KEY)
  const payload = {
    opportunityTitle: input.opportunityTitle,
    agency: input.agency,
    synopsis: truncate(input.synopsis ?? '', 2000),
    summaryText: truncate(input.summaryText ?? '', 2000),
    contacts: input.research.contacts,
    attachments: input.research.attachments,
    missingDocumentSignals: input.research.missingDocumentSignals,
  }

  const instruction =
    'Return JSON only with a `questions` array. Each item must have `question` and `rationale`. Create 5 to 7 questions a proposal owner should answer before drafting. Use only the provided data and never invent facts.'

  let response: Response
  if (usingClaude) {
    response = await fetch(process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
        max_tokens: 700,
        temperature: 0.2,
        system: instruction,
        messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      }),
      cache: 'no-store',
    })
  } else {
    response = await fetch(process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: JSON.stringify(payload, null, 2) },
        ],
      }),
      cache: 'no-store',
    })
  }

  if (!response.ok) {
    return null
  }

  const result = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    choices?: Array<{ message?: { content?: string | null } }>
  }

  const text = usingClaude
    ? result.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n').trim()
    : result.choices?.[0]?.message?.content?.trim()

  if (!text) {
    return null
  }

  try {
    const parsed = JSON.parse(text) as { questions?: Array<ProposalQuestion> }
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return parsed.questions.filter((item): item is ProposalQuestion => Boolean(item?.question && item?.rationale))
    }
  } catch {
    return null
  }

  return null
}

export async function generateProposalQuestions(input: ProposalQuestionInput): Promise<ProposalQuestion[]> {
  const questions = await callAiProposalQuestions(input)
  return questions && questions.length > 0 ? questions : fallbackProposalQuestions(input)
}

export type ProposalDraftSectionItem = {
  title: string
  detail: string
  evidence: string
}

export type ProposalDraftPastPerformanceClaim = {
  claim: string
  evidence: string
  relevance: string
}

export type ProposalDraftContent = {
  proposalSummary: string
  responseStrategy: string
  complianceChecklist: string
  riskNotes: string
  proposalSections: {
    scope: ProposalDraftSectionItem[]
    approach: ProposalDraftSectionItem[]
    pastPerformanceClaims: ProposalDraftPastPerformanceClaim[]
  }
}

type ProposalDraftInput = {
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
  opportunity: {
    title: string
    agency: string | null
    synopsis: string | null
    summaryText: string | null
    responseDeadlineAt: string | null
  }
  research: OpportunityResearchResult
  awardHistorySummary: string | null
  questions: ProposalQuestion[]
  uploadedDocuments: Array<{
    fileName: string
    mimeType: string | null
    extractedText: string
    uploadedAt: string
  }>
}

type RequirementSignal = {
  requirement: string
  source: string
}

function collectRequirementSignals(input: ProposalDraftInput): RequirementSignal[] {
  const signals: RequirementSignal[] = []
  const combinedTexts = [
    {
      source: 'Notice synopsis',
      text: input.opportunity.synopsis ?? '',
    },
    ...input.uploadedDocuments.map((doc) => ({ source: `Uploaded document: ${doc.fileName}`, text: doc.extractedText ?? '' })),
  ]

  const patterns = [
    /(?:CLIN|contract line item)\s*[#:]?\s*([0-9A-Z-]+)/gi,
    /(?:deliverable(?:s)?|deliver|submission(?:s)?)\s*[:\-]?\s*([^\.\n]{8,180})/gi,
    /(?:shall|must|required to)\s+([^\.\n]{8,180})/gi,
    /(?:due date|deadline|response due|proposal due)\s*[:\-]?\s*([^\.\n]{4,120})/gi,
    /(?:SOW|PWS|statement of work|performance work statement)\s*[:\-]?\s*([^\.\n]{8,180})/gi,
  ]

  for (const block of combinedTexts) {
    if (!block.text) {
      continue
    }

    for (const pattern of patterns) {
      const matches = block.text.matchAll(pattern)
      for (const match of matches) {
        const requirementText = (match[0] ?? '').replace(/\s+/g, ' ').trim()
        if (requirementText.length >= 12) {
          signals.push({ requirement: requirementText, source: block.source })
        }
      }
    }
  }

  return dedupeByKey(signals, (item) => `${item.requirement}|${item.source}`).slice(0, 24)
}

function toCitation(source: string) {
  return `[Source: ${source}]`
}

function fallbackProposalDraft(input: ProposalDraftInput): ProposalDraftContent {
  const opportunityName = input.opportunity.title
  const agency = input.opportunity.agency ?? 'the issuing agency'
  const certifications = input.companyProfile.certifications.length > 0 ? input.companyProfile.certifications.join(', ') : 'No certifications listed yet'
  const contacts = input.research.contactEmails.length > 0 ? input.research.contactEmails.join(', ') : 'No verified contact email extracted yet'
  const attachments = input.research.attachments
    .map((item) => item.title ?? item.url ?? null)
    .filter((value): value is string => Boolean(value))
  const dueDate = input.opportunity.responseDeadlineAt ?? 'Deadline not listed'
  const uploadedDocsSummary = input.uploadedDocuments
    .slice(0, 4)
    .map((doc) => doc.fileName)
    .join(', ')
  const requirementSignals = collectRequirementSignals(input)
  const criticalInstructions = input.research.apiSections.criticalInstructions
  const requirementChecklistLines = requirementSignals.slice(0, 8).map((item) => `- ${item.requirement} ${toCitation(item.source)}`)
  const criticalInstructionLines = criticalInstructions.slice(0, 6).map((item) => `- Critical notice instruction: ${item}`)
  const primarySource = uploadedDocsSummary ? `Uploaded docs (${uploadedDocsSummary})` : 'SAM notice and opportunity data'
  const checklistLines = [
    ...attachments.map((item) => `- Confirm and upload: ${item}`),
    '- Validate SAM submission portal requirements',
    '- Confirm final technical narrative and pricing package alignment',
    `- Send clarifications to: ${contacts}`,
    uploadedDocsSummary ? `- Review uploaded contract docs: ${uploadedDocsSummary}` : null,
    ...criticalInstructionLines,
    ...requirementChecklistLines,
  ]
    .filter((line): line is string => Boolean(line))

  return {
    proposalSummary: [
      `${input.companyName} intends to submit a targeted response for ${opportunityName} issued by ${agency}.`,
      input.opportunity.summaryText ?? input.research.aiSummary ?? input.opportunity.synopsis ?? 'The notice indicates a requirement aligned to our capabilities and public-sector delivery model.',
      `This draft uses available notice metadata, extracted contacts, and known company strengths to establish a compliant baseline response before final review.`,
      uploadedDocsSummary ? `User-uploaded documents reviewed: ${uploadedDocsSummary}.` : null,
      `Confidence: Medium ${toCitation(primarySource)}.`,
    ].join(' '),
    responseStrategy: [
      `1. Scope alignment: map each requirement in ${opportunityName} to owned capabilities, NAICS coverage, and staffing commitments.`,
      '2. Delivery plan: provide phased execution with milestones, staffing roles, quality controls, and risk mitigations.',
      '3. Evidence strategy: include measurable outcomes, relevant contract references, and differentiators supported by documentation.',
      `4. Submission readiness: complete final package and internal review prior to ${dueDate}.`,
      `Confidence: Medium ${toCitation(primarySource)}.`,
    ].join('\n'),
    complianceChecklist: checklistLines.join('\n'),
    riskNotes: [
      input.research.missingDocumentSignals.length > 0
        ? `Missing signals: ${input.research.missingDocumentSignals.join(' | ')}`
        : 'No major missing-document signals were detected in the current payload.',
      input.companyProfile.capabilityStatement ? null : 'Capability statement is not stored; finalize one before submission.',
      `Verify proposal contact path: ${contacts}.`,
      criticalInstructions.length > 0 ? `Critical solicitation instructions captured: ${criticalInstructions.slice(0, 4).join(' | ')}.` : null,
      requirementSignals.length === 0 ? `No strong requirement signals were extracted from uploaded docs. Confidence: Low ${toCitation(primarySource)}.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n'),
    proposalSections: {
      scope: [
        {
          title: 'Requirement Mapping',
          detail: `Map each solicitation requirement to specific work packages and accountable delivery owners for ${opportunityName}.`,
          evidence: `NAICS: ${input.companyProfile.naicsCodes.join(', ') || 'Not listed'} | PSC: ${input.companyProfile.pscCodes.join(', ') || 'Not listed'} ${toCitation(primarySource)}`,
        },
      ],
      approach: [
        {
          title: 'Execution Model',
          detail: 'Use a phased mobilization-to-delivery approach with recurring performance reporting and compliance checks.',
          evidence: `Team size: ${input.companyProfile.teamSize ?? 'Not listed'} | Coverage: ${input.companyProfile.geographicCoverage ?? 'Not listed'} ${toCitation(primarySource)}`,
        },
      ],
      pastPerformanceClaims: [
        {
          claim: `Our team has experience delivering comparable outcomes for public-sector customers with mission-critical timelines.`,
          evidence: `${input.awardHistorySummary ?? 'Add prior contract outcomes, performance metrics, and customer references.'} ${toCitation('Historical awards intelligence')}`,
          relevance: `Supports confidence in on-time delivery and requirement conformance for ${opportunityName}.`,
        },
      ],
    },
  }
}

function stripMarkdownCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced?.[1]?.trim() ?? text.trim()
}

function normalizeDraftFromUnknown(value: unknown): ProposalDraftContent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const proposalSections = (record.proposalSections ?? {}) as Record<string, unknown>

  const toSectionItems = (items: unknown): ProposalDraftSectionItem[] => {
    if (!Array.isArray(items)) {
      return []
    }

    return items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const sectionItem = item as Record<string, unknown>
        return {
          title: hasText(sectionItem.title) ? sectionItem.title.trim() : '',
          detail: hasText(sectionItem.detail) ? sectionItem.detail.trim() : '',
          evidence: hasText(sectionItem.evidence) ? sectionItem.evidence.trim() : '',
        }
      })
      .filter((item): item is ProposalDraftSectionItem => Boolean(item && (item.title || item.detail || item.evidence)))
  }

  const toClaims = (items: unknown): ProposalDraftPastPerformanceClaim[] => {
    if (!Array.isArray(items)) {
      return []
    }

    return items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const claim = item as Record<string, unknown>
        return {
          claim: hasText(claim.claim) ? claim.claim.trim() : '',
          evidence: hasText(claim.evidence) ? claim.evidence.trim() : '',
          relevance: hasText(claim.relevance) ? claim.relevance.trim() : '',
        }
      })
      .filter((item): item is ProposalDraftPastPerformanceClaim => Boolean(item && (item.claim || item.evidence || item.relevance)))
  }

  const parsed: ProposalDraftContent = {
    proposalSummary: hasText(record.proposalSummary) ? record.proposalSummary.trim() : '',
    responseStrategy: hasText(record.responseStrategy) ? record.responseStrategy.trim() : '',
    complianceChecklist: hasText(record.complianceChecklist) ? record.complianceChecklist.trim() : '',
    riskNotes: hasText(record.riskNotes) ? record.riskNotes.trim() : '',
    proposalSections: {
      scope: toSectionItems(proposalSections.scope),
      approach: toSectionItems(proposalSections.approach),
      pastPerformanceClaims: toClaims(proposalSections.pastPerformanceClaims),
    },
  }

  if (!parsed.proposalSummary && !parsed.responseStrategy && !parsed.complianceChecklist && !parsed.riskNotes) {
    return null
  }

  return parsed
}

async function callAiProposalDraft(input: ProposalDraftInput): Promise<ProposalDraftContent | null> {
  const provider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  const apiKey = provider === 'claude' || provider === 'anthropic' || process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY : process.env.OPENAI_API_KEY
  if (!apiKey) {
    return null
  }

  const usingClaude = Boolean(provider === 'claude' || provider === 'anthropic' || process.env.CLAUDE_API_KEY)
  const promptPayload = {
    companyName: input.companyName,
    companyProfile: input.companyProfile,
    opportunity: input.opportunity,
    research: {
      aiSummary: input.research.aiSummary,
      contactEmails: input.research.contactEmails,
      contacts: input.research.contacts,
      attachments: input.research.attachments,
      missingDocumentSignals: input.research.missingDocumentSignals,
      criticalInstructions: input.research.apiSections.criticalInstructions,
    },
    awardHistorySummary: input.awardHistorySummary,
    questions: input.questions,
    uploadedDocuments: input.uploadedDocuments.map((doc) => ({
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt,
      extractedText: truncate(doc.extractedText ?? '', 2000),
    })),
    requirementSignals: collectRequirementSignals(input),
  }

  const instruction =
    'Return JSON only. Build a full proposal draft from provided facts only (no invented contracts, certifications, outcomes, pricing, or names). Return this exact shape: {"proposalSummary": string, "responseStrategy": string, "complianceChecklist": string, "riskNotes": string, "proposalSections": {"scope": [{"title": string, "detail": string, "evidence": string}], "approach": [{"title": string, "detail": string, "evidence": string}], "pastPerformanceClaims": [{"claim": string, "evidence": string, "relevance": string}]}}. Use concise federal proposal language, include checklist bullets as newline-separated lines, and include source citations inline using [Source: ...]. Also add a confidence label (High/Medium/Low) in proposalSummary and responseStrategy based on source quality.'

  let response: Response
  if (usingClaude) {
    response = await fetch(process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
        max_tokens: 1800,
        temperature: 0.2,
        system: instruction,
        messages: [{ role: 'user', content: JSON.stringify(promptPayload, null, 2) }],
      }),
      cache: 'no-store',
    })
  } else {
    response = await fetch(process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: JSON.stringify(promptPayload, null, 2) },
        ],
      }),
      cache: 'no-store',
    })
  }

  if (!response.ok) {
    return null
  }

  const result = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    choices?: Array<{ message?: { content?: string | null } }>
  }

  const raw = usingClaude
    ? result.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n').trim()
    : result.choices?.[0]?.message?.content?.trim()

  if (!raw) {
    return null
  }

  try {
    const normalizedText = stripMarkdownCodeFence(raw)
    const parsed = JSON.parse(normalizedText) as unknown
    return normalizeDraftFromUnknown(parsed)
  } catch {
    return null
  }
}

export async function generateProposalDraftContent(input: ProposalDraftInput): Promise<ProposalDraftContent> {
  const aiDraft = await callAiProposalDraft(input)
  if (aiDraft) {
    return aiDraft
  }

  return fallbackProposalDraft(input)
}
