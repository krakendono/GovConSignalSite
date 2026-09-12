export type GoDaddyContractFile = {
  originalFileName: string
  savedFileName: string
  storagePath: string
  fileSizeBytes: number
  sourcePortal: string
  downloadedAtUtc: string | null
}

export type GoDaddyContract = {
  noticeId: string
  solicitationNumber: string | null
  title: string
  contractType: string | null
  responseDeadline: string | null
  responseTimeZone: string | null
  samUrl: string | null
  retrievedAtUtc: string | null
  status: string
  files: GoDaddyContractFile[]
}

type GatewayResponse = {
  generatedAtUtc: string
  count: number
  contracts: GoDaddyContract[]
}

export function getGoDaddyGatewayUrl() {
  return process.env.GODADDY_CONTRACT_GATEWAY_URL?.trim() ?? ''
}

export async function getGoDaddyContracts(): Promise<GatewayResponse> {
  const gatewayUrl = getGoDaddyGatewayUrl()
  if (!gatewayUrl) {
    return { generatedAtUtc: '', count: 0, contracts: [] }
  }

  const response = await fetch(gatewayUrl, {
    next: { revalidate: 60 },
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`GoDaddy contract gateway returned HTTP ${response.status}`)
  }

  const payload = (await response.json()) as GatewayResponse
  return {
    generatedAtUtc: payload.generatedAtUtc ?? '',
    count: Number(payload.count ?? payload.contracts?.length ?? 0),
    contracts: Array.isArray(payload.contracts) ? payload.contracts : [],
  }
}

export function goDaddyFileUrl(storagePath: string) {
  const gatewayUrl = getGoDaddyGatewayUrl()
  if (!gatewayUrl) return '#'
  const separator = gatewayUrl.includes('?') ? '&' : '?'
  return `${gatewayUrl}${separator}file=${encodeURIComponent(storagePath)}`
}
