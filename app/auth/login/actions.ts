'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

export async function signInWithMagicLink(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect('/auth/login?error=Email%20is%20required')
  }

  const supabase = await createSupabaseServerClient()
  const headerStore = await headers()
  const origin = headerStore.get('origin') ?? 'http://localhost:3000'

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/auth/login?message=Check%20your%20email%20for%20the%20login%20link')
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect('/')
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}
