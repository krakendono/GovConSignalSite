import { createSupabaseServerClient } from '@/lib/supabase/server'

type AuditActionInput = {
  actorUserId?: string | null
  targetUserId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
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

export async function logAuditAction(input: AuditActionInput) {
  try {
    const supabase = await createSupabaseServerClient()
    const metadata = sanitizeValue(input.metadata ?? {}) as Record<string, unknown>

    await supabase.from('audit_logs').insert({
      actor_user_id: input.actorUserId ?? null,
      target_user_id: input.targetUserId ?? null,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata,
    })
  } catch {
    // Best-effort audit logging; never block the primary user action.
  }
}
