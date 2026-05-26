import { createSupabaseServerClient } from '@/lib/supabase/server'

type UsageStatus = 'success' | 'error'

type LogUsageEventInput = {
  actorUserId?: string | null
  companyId?: string | null
  opportunityId?: string | null
  action: string
  provider?: string | null
  model?: string | null
  status: UsageStatus
  durationMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  estimatedCostUsd?: number | null
  metadata?: Record<string, unknown>
}

type ResolvedAiProviderModel = {
  provider: string
  model: string | null
  configured: boolean
}

const SENSITIVE_KEY_PATTERN = /(password|passphrase|card|cvv|cvc|secret|token)/i

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}

    Object.entries(source).forEach(([key, nestedValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return
      }
      result[key] = sanitizeValue(nestedValue)
    })

    return result
  }

  return value
}

export function getConfiguredAiProviderModel(): ResolvedAiProviderModel {
  const configuredProvider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  const hasClaude = Boolean(process.env.CLAUDE_API_KEY)
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY)

  if (configuredProvider === 'claude' || configuredProvider === 'anthropic' || hasClaude) {
    return {
      provider: 'anthropic',
      model: process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
      configured: hasClaude,
    }
  }

  return {
    provider: 'openai',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    configured: hasOpenAi,
  }
}

export async function logUsageEvent(input: LogUsageEventInput) {
  try {
    const supabase = await createSupabaseServerClient()
    const metadata = sanitizeValue(input.metadata ?? {}) as Record<string, unknown>

    await supabase.from('usage_events').insert({
      actor_user_id: input.actorUserId ?? null,
      company_id: input.companyId ?? null,
      opportunity_id: input.opportunityId ?? null,
      action: input.action,
      provider: input.provider ?? null,
      model: input.model ?? null,
      status: input.status,
      duration_ms: input.durationMs ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      metadata,
    })
  } catch {
    // Best-effort telemetry logging; never block the primary user action.
  }
}
