type SamGovOpportunity = {
  sourceNoticeId: string
  title: string
  synopsis: string | null
  agency: string | null
  naicsCode: string | null
  pscCode: string | null
  postedAt: string | null
  responseDeadlineAt: string | null
  archiveDate: string | null
  noticeUrl: string | null
  rawPayload: Record<string, unknown>
}

type FetchSamGovOptions = {
  postedFromIso?: string | null
}

const SAM_OPPORTUNITIES_TIMEOUT_MS = 15000
const MAX_SAM_RETRY_WAIT_MS = 15000
const NOTICE_DESCRIPTION_CONCURRENCY = 4
const MIN_SAM_LIMIT = 25
const MAX_SAM_REQUEST_ATTEMPTS = 8
const MAX_SAM_SHORT_RETRY_WAIT_MS = 5000
const SAM_POSTED_WINDOW_DAYS = [30, 14, 7, 3, 1] as const

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()))
  return results
}

type SamNoticeDescriptionPayload = Record<string, unknown>

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

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return null
  }

  const asNumber = Number(value)
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber
  }

  const asDate = new Date(value)
  if (!Number.isNaN(asDate.getTime())) {
    const seconds = Math.ceil((asDate.getTime() - Date.now()) / 1000)
    return Math.max(0, seconds)
  }

  return null
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isHttpUrl(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function pickLongest(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .sort((left, right) => right.length - left.length)[0] ?? null
}

function extractNoticeDescriptionText(payload: SamNoticeDescriptionPayload): string | null {
  const directCandidates = [
    toStringOrNull(payload.description),
    toStringOrNull(payload.synopsis),
    toStringOrNull(payload.noticeDescription),
    toStringOrNull(payload.noticeText),
    toStringOrNull(payload.additionalInfo),
    toStringOrNull(payload.content),
  ]

  const direct = pickLongest(directCandidates)
  if (direct) {
    return compactText(direct).slice(0, 12000)
  }

  const discovered: string[] = []
  const visit = (value: unknown) => {
    if (!value) {
      return
    }

    if (typeof value === 'string') {
      const text = compactText(value)
      if (text.length >= 80 && !/^https?:\/\//i.test(text)) {
        discovered.push(text)
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item))
      return
    }

    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((nested) => visit(nested))
    }
  }

  visit(payload)
  const longest = discovered.sort((left, right) => right.length - left.length)[0] ?? null
  return longest ? longest.slice(0, 12000) : null
}

async function fetchSamNoticeDescription(descriptionUrl: string, apiKey: string): Promise<SamNoticeDescriptionPayload | null> {
  try {
    const url = new URL(descriptionUrl)
    if (!url.searchParams.get('api_key')) {
      url.searchParams.set('api_key', apiKey)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timeout))
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as unknown
    return payload && typeof payload === 'object' ? (payload as SamNoticeDescriptionPayload) : null
  } catch {
    return null
  }
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
    archiveDate: toIsoDateOrNull(record.archiveDate),
    noticeUrl: toStringOrNull(record.uiLink) ?? toStringOrNull(record.noticeUrl) ?? toStringOrNull(record.link),
    rawPayload: record,
  }
}

async function enrichRecordWithNoticeDescription(record: SamGovOpportunity, apiKey: string): Promise<SamGovOpportunity> {
  const descriptionLink = toStringOrNull(record.rawPayload.description)
  const shouldResolveDescription =
    isHttpUrl(descriptionLink) &&
    (!record.synopsis || record.synopsis === descriptionLink || record.synopsis.length < 120)

  if (!shouldResolveDescription || !descriptionLink) {
    return record
  }

  const descriptionPayload = await fetchSamNoticeDescription(descriptionLink, apiKey)
  if (!descriptionPayload) {
    return record
  }

  const descriptionText = extractNoticeDescriptionText(descriptionPayload)
  return {
    ...record,
    synopsis: descriptionText ?? record.synopsis,
    rawPayload: {
      ...record.rawPayload,
      noticeDescriptionPayload: descriptionPayload,
      noticeDescriptionText: descriptionText,
    },
  }
}

export async function fetchSamGovOpportunities(limit = 50, options?: FetchSamGovOptions) {
  const apiUrl = process.env.SAM_GOV_OPPORTUNITIES_API_URL ?? 'https://api.sam.gov/opportunities/v2/search'
  const apiKey = process.env.SAM_GOV_API_KEY

  if (!apiKey) {
    throw new Error('SAM_GOV_API_KEY is required for SAM.gov opportunities API')
  }

  const requestedLimit = Math.max(MIN_SAM_LIMIT, Math.floor(limit))
  const limitCandidates = Array.from(
    new Set(
      [requestedLimit, 750, 500, 250, 100, 50, MIN_SAM_LIMIT].filter(
        (candidate) => candidate <= requestedLimit && candidate >= MIN_SAM_LIMIT,
      ),
    ),
  ).sort((left, right) => right - left)

  const now = new Date()
  const configuredPostedFrom = options?.postedFromIso ? new Date(options.postedFromIso) : null
  const hasConfiguredPostedFrom = Boolean(configuredPostedFrom && !Number.isNaN(configuredPostedFrom.getTime()))
  const configuredDaysBack = hasConfiguredPostedFrom
    ? Math.max(1, Math.ceil((now.getTime() - (configuredPostedFrom as Date).getTime()) / (24 * 60 * 60 * 1000)))
    : null

  const windowCandidates = hasConfiguredPostedFrom
    ? Array.from(new Set([1, 3, configuredDaysBack ?? 1]))
        .filter((daysBack) => daysBack <= (configuredDaysBack ?? 1))
        .sort((left, right) => left - right)
    : [...SAM_POSTED_WINDOW_DAYS].sort((left, right) => left - right)

  const queryCandidates: Array<{ limit: number; postedFrom: Date; postedTo: Date }> = []
  for (const daysBack of windowCandidates) {
    const postedTo = new Date()
    const postedFrom = new Date()
    postedFrom.setDate(postedFrom.getDate() - daysBack)

    for (const candidateLimit of limitCandidates) {
      queryCandidates.push({
        limit: candidateLimit,
        postedFrom,
        postedTo,
      })
    }
  }

  let payload: Record<string, unknown> | null = null
  let lastStatus: number | null = null
  let attempts = 0

  for (const candidate of queryCandidates) {
    if (attempts >= MAX_SAM_REQUEST_ATTEMPTS) {
      break
    }

    const url = new URL(apiUrl)
    url.searchParams.set('limit', String(candidate.limit))
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('postedFrom', formatSamDate(candidate.postedFrom))
    url.searchParams.set('postedTo', formatSamDate(candidate.postedTo))

    const performRequest = async () => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), SAM_OPPORTUNITIES_TIMEOUT_MS)
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timeout))
        return response
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('SAM.gov request timed out. Please retry sync in a moment.')
        }
        throw error
      }
    }

    let response = await performRequest()
    attempts += 1
    lastStatus = response.status

    if (response.ok) {
      payload = (await response.json()) as Record<string, unknown>
      break
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'))
      const backoffMs = retryAfterSeconds !== null ? retryAfterSeconds * 1000 : 1200

      if (
        backoffMs <= MAX_SAM_SHORT_RETRY_WAIT_MS &&
        backoffMs <= MAX_SAM_RETRY_WAIT_MS &&
        attempts < MAX_SAM_REQUEST_ATTEMPTS
      ) {
        await delay(backoffMs)
        response = await performRequest()
        attempts += 1
        lastStatus = response.status

        if (response.ok) {
          payload = (await response.json()) as Record<string, unknown>
          break
        }
      }

      continue
    }

    throw new Error(`SAM.gov opportunities request failed with status ${response.status}`)
  }

  if (!payload) {
    if (lastStatus === 429) {
      throw new Error('SAM.gov is currently rate limited, even after reducing date range and batch size. Wait about a minute and run sync again.')
    }
    throw new Error('SAM.gov opportunities request failed after retry attempts')
  }

  const candidates =
    (Array.isArray(payload.opportunitiesData) ? payload.opportunitiesData : null) ??
    (Array.isArray(payload.opportunities) ? payload.opportunities : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []

  const normalized = candidates
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeRecord(item))
    .filter((item): item is SamGovOpportunity => Boolean(item))

  const enriched = await mapWithConcurrency(normalized, NOTICE_DESCRIPTION_CONCURRENCY, (item) =>
    enrichRecordWithNoticeDescription(item, apiKey),
  )

  return enriched
}

export type { SamGovOpportunity }
