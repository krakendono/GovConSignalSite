type SamGovOpportunity = {
  sourceNoticeId: string
  title: string
  synopsis: string | null
  agency: string | null
  naicsCode: string | null
  pscCode: string | null
  postedAt: string | null
  responseDeadlineAt: string | null
  noticeUrl: string | null
  rawPayload: Record<string, unknown>
}

function formatSamDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${month}/${day}/${year}`
}

function toStringOrNull(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toIsoDateOrNull(value: unknown) {
  const raw = toStringOrNull(value)
  if (!raw) {
    return null
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function normalizeRecord(record: Record<string, unknown>): SamGovOpportunity | null {
  const sourceNoticeId =
    toStringOrNull(record.noticeId) ??
    toStringOrNull(record.solicitationNumber) ??
    toStringOrNull(record.id) ??
    toStringOrNull(record.opportunityId)

  const title = toStringOrNull(record.title) ?? toStringOrNull(record.noticeTitle)

  if (!sourceNoticeId || !title) {
    return null
  }

  return {
    sourceNoticeId,
    title,
    synopsis: toStringOrNull(record.synopsis) ?? toStringOrNull(record.description),
    agency:
      toStringOrNull(record.fullParentPathName) ??
      toStringOrNull(record.organizationHierarchy) ??
      toStringOrNull(record.department) ??
      toStringOrNull(record.office),
    naicsCode: toStringOrNull(record.naicsCode) ?? toStringOrNull(record.naics),
    pscCode: toStringOrNull(record.pscCode) ?? toStringOrNull(record.classificationCode),
    postedAt: toIsoDateOrNull(record.postedDate) ?? toIsoDateOrNull(record.publishedDate),
    responseDeadlineAt:
      toIsoDateOrNull(record.responseDeadLine) ?? toIsoDateOrNull(record.responseDate) ?? toIsoDateOrNull(record.archiveDate),
    noticeUrl: toStringOrNull(record.uiLink) ?? toStringOrNull(record.noticeUrl) ?? toStringOrNull(record.link),
    rawPayload: record,
  }
}

export async function fetchSamGovOpportunities(limit = 50) {
  const apiUrl = process.env.SAM_GOV_OPPORTUNITIES_API_URL ?? 'https://api.sam.gov/opportunities/v2/search'
  const apiKey = process.env.SAM_GOV_API_KEY

  if (!apiKey) {
    throw new Error('SAM_GOV_API_KEY is required for SAM.gov opportunities API')
  }

  const postedTo = new Date()
  const postedFrom = new Date()
  postedFrom.setDate(postedFrom.getDate() - 30)

  const url = new URL(apiUrl)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('postedFrom', formatSamDate(postedFrom))
  url.searchParams.set('postedTo', formatSamDate(postedTo))

  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`SAM.gov opportunities request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as Record<string, unknown>

  const candidates =
    (Array.isArray(payload.opportunitiesData) ? payload.opportunitiesData : null) ??
    (Array.isArray(payload.opportunities) ? payload.opportunities : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []

  const normalized = candidates
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeRecord(item))
    .filter((item): item is SamGovOpportunity => Boolean(item))

  return normalized
}

export type { SamGovOpportunity }
