import { createClient } from '@supabase/supabase-js'

type AdminEnv = {
  url: string
  serviceRoleKey: string
}

function readAdminEnv(): AdminEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing admin Supabase environment values')
  }

  return { url, serviceRoleKey }
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = readAdminEnv()

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
