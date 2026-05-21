type PublicSupabaseEnvKey = 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

function readRequiredEnv(key: PublicSupabaseEnvKey): string {
  const value = process.env[key]

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

export function getSupabasePublicEnv() {
  return {
    url: readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: readRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
