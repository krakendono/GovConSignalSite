type ContractAwardsSearchInput = {
  title: string
  agency: string | null
  naicsCode: string | null
  pscCode: string | null
}

type ContractAwardRecord = {
  vendorName: string | null
  awardDate: string | null
  awardAmount: number | null
  description: string | null
  agency: string | null
  rawPayload: Record<string, unknown>
}

type ContractAwardIntelligence = {
  awardCount: number
  incumbentVendor: string | null
  lastAwardDate: string | null
  totalAwardValue: number | null
  rebidSignal: string
  summaryText: string
  sourceRecords: ContractAwardRecord[]
}

function toStringOrNull(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
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

function normalizeRecord(record: Record<string, unknown>): ContractAwardRecord | null {
  const awardDate =
    toIsoDateOrNull(record.awardDate) ??
    toIsoDateOrNull(record.actionDate) ??
    toIsoDateOrNull(record.date) ??
    toIsoDateOrNull(record.modificationDate)

  const vendorName =
    toStringOrNull(record.vendorName) ??
    toStringOrNull(record.recipientName) ??
    toStringOrNull(record.awardeeName) ??
    toStringOrNull(record.incumbent) ??
    toStringOrNull(record.vendor)

  const description =
    toStringOrNull(record.description) ??
    toStringOrNull(record.awardDescription) ??
    toStringOrNull(record.title) ??
    toStringOrNull(record.shortDescription)

  const agency =
    toStringOrNull(record.agency) ??
    toStringOrNull(record.awardingAgency) ??
    toStringOrNull(record.department) ??
    toStringOrNull(record.office)

  const awardAmount =
    toNumberOrNull(record.awardAmount) ??
    toNumberOrNull(record.baseAndAllOptionsValue) ??
    toNumberOrNull(record.obligatedAmount) ??
    toNumberOrNull(record.totalValue)

  if (!vendorName && !description && !awardDate) {
    return null
  }

  return {
    vendorName,
    awardDate,
    awardAmount,
    description,
    agency,
    rawPayload: record,
  }
}

function summarizeIntelligence(records: ContractAwardRecord[]): ContractAwardIntelligence | null {
  if (records.length === 0) {
    return null
  }

  const sortedRecords = [...records].sort((left, right) => {
    const leftTime = left.awardDate ? new Date(left.awardDate).getTime() : 0
    const rightTime = right.awardDate ? new Date(right.awardDate).getTime() : 0
    return rightTime - leftTime
  })

  const lastAwardDate = sortedRecords[0]?.awardDate ?? null
  const vendorCounts = new Map<string, number>()
  let totalAwardValue = 0
  let hasAnyAwardValue = false

  sortedRecords.forEach((record) => {
    if (record.vendorName) {
      vendorCounts.set(record.vendorName, (vendorCounts.get(record.vendorName) ?? 0) + 1)
    }

    if (typeof record.awardAmount === 'number') {
      totalAwardValue += record.awardAmount
      hasAnyAwardValue = true
    }
  })

  let incumbentVendor: string | null = null
  let incumbentCount = 0
  vendorCounts.forEach((count, vendor) => {
    if (count > incumbentCount) {
      incumbentVendor = vendor
      incumbentCount = count
    }
  })

  const awardCount = sortedRecords.length
  const repeatAwardSignal = incumbentCount > 1 ? `Repeated awards seen for ${incumbentVendor}.` : 'No repeated incumbent pattern detected.'
  const timingSignal = lastAwardDate ? `Most recent award on ${new Date(lastAwardDate).toLocaleDateString()}.` : 'No award date available.'
  const valueSignal = hasAnyAwardValue ? `Total historical award value about $${totalAwardValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}.` : 'No award value available.'

  return {
    awardCount,
    incumbentVendor,
    lastAwardDate,
    totalAwardValue: hasAnyAwardValue ? totalAwardValue : null,
    rebidSignal: repeatAwardSignal,
    summaryText: `${awardCount} historical award${awardCount === 1 ? '' : 's'} found. ${timingSignal} ${valueSignal}`,
    sourceRecords: sortedRecords,
  }
}

export async function fetchContractAwardIntelligence(input: ContractAwardsSearchInput) {
  const apiUrl = process.env.SAM_GOV_CONTRACT_AWARDS_API_URL
  const apiKey = process.env.SAM_GOV_CONTRACT_AWARDS_API_KEY ?? process.env.SAM_GOV_API_KEY

  if (!apiUrl || !apiKey) {
    return null
  }

  const url = new URL(apiUrl)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('limit', '10')
  url.searchParams.set('q', input.title)

  if (input.agency) {
    url.searchParams.set('agency', input.agency)
  }

  if (input.naicsCode) {
    url.searchParams.set('naicsCode', input.naicsCode)
  }

  if (input.pscCode) {
    url.searchParams.set('pscCode', input.pscCode)
  }

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as Record<string, unknown>
  const candidates =
    (Array.isArray(payload.awardsData) ? payload.awardsData : null) ??
    (Array.isArray(payload.awards) ? payload.awards : null) ??
    (Array.isArray(payload.results) ? payload.results : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    []

  const records = candidates
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeRecord(item))
    .filter((item): item is ContractAwardRecord => Boolean(item))

  return summarizeIntelligence(records)
}

export type { ContractAwardIntelligence }