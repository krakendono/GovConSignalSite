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

export async function signInWithPassword(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/auth/login?error=Email%20and%20password%20are%20required')
  }

  const supabase = await createSupabaseServerClient()

  const signInResult = await supabase.auth.signInWithPassword({ email, password })

  if (signInResult.error) {
    if (process.env.NODE_ENV !== 'production') {
      const signUpResult = await supabase.auth.signUp({
        email,
        password,
      })

      if (!signUpResult.error && signUpResult.data.session) {
        redirect('/dashboard')
      }

      if (!signUpResult.error && !signUpResult.data.session) {
        redirect(
          '/auth/login?error=Account%20created%2C%20but%20email%20confirmation%20is%20enabled%20in%20Supabase.%20Turn%20off%20Confirm%20email%20for%20local%20development%20or%20use%20magic%20link.',
        )
      }
    }

    redirect(`/auth/login?error=${encodeURIComponent(signInResult.error.message)}`)
  }

  redirect('/dashboard')
}

export async function signInAnonymously() {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInAnonymously()

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}

export async function signUpWithPassword(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/auth/login?error=Email%20and%20password%20are%20required')
  }

  const supabase = await createSupabaseServerClient()
  const headerStore = await headers()
  const origin = headerStore.get('origin') ?? 'http://localhost:3000'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/auth/login?message=Account%20created.%20If%20email%20confirmation%20is%20enabled,%20check%20your%20inbox.%20Otherwise,%20sign%20in%20with%20your%20password.')
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect('/')
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}
