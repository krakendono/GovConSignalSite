function readRequiredEnv(key: 'NEXT_PUBLIC_SUPABASE_URL'): string
function readRequiredEnv(key: 'SUPABASE_PUBLIC_KEY'): string
function readRequiredEnv(key: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_PUBLIC_KEY'): string {
  const value =
    key === 'SUPABASE_PUBLIC_KEY'
      ? (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      : process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

export function getSupabasePublicEnv() {
  return {
    url: readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: readRequiredEnv('SUPABASE_PUBLIC_KEY'),
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
