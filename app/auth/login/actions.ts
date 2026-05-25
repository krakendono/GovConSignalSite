'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/env'
import { logAuditAction } from '@/lib/audit'

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await logAuditAction({
    actorUserId: user?.id,
    action: 'auth.sign_in_anonymous',
    entityType: 'session',
  })

  redirect('/dashboard')
}

export async function sendPasswordResetLink(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const email = String(formData.get('email') ?? '').trim()
  const testAccountEmail = 'm@s.com'

  if (!email) {
    redirect('/auth/login?error=Enter%20your%20email%20to%20reset%20your%20password')
  }

  const supabase = await createSupabaseServerClient()

  if (process.env.NODE_ENV !== 'production' && email.toLowerCase() === testAccountEmail) {
    let quickLoginSucceeded = false

    try {
      const adminClient = createSupabaseAdminClient()
      const { data: userListData, error: userListError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (!userListError) {
        const existingUser = userListData.users.find((candidate) =>
          (candidate.email ?? '').toLowerCase() === email.toLowerCase(),
        )

        if (existingUser) {
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email,
          })

          if (!linkError && linkData.properties?.email_otp) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              email,
              token: linkData.properties.email_otp,
              type: 'magiclink',
            })

            if (!verifyError) {
              const {
                data: { user },
              } = await supabase.auth.getUser()

              await logAuditAction({
                actorUserId: user?.id,
                action: 'auth.local_email_quick_login',
                entityType: 'session',
                metadata: { email },
              })

              quickLoginSucceeded = true
            }
          }
        }
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'digest' in error && String((error as { digest?: string }).digest).includes('NEXT_REDIRECT')) {
        throw error
      }

      const message = error instanceof Error ? error.message : 'Local password reset shortcut failed'
      redirect(`/auth/login?error=${encodeURIComponent(message)}`)
    }

    if (quickLoginSucceeded) {
      redirect('/dashboard?message=Local%20quick%20login%20used%20for%20existing%20account')
    }

    redirect(
      `/auth/login?error=${encodeURIComponent(
        'No matching local test account found for that email. Use password sign-in or create the account first.',
      )}`,
    )
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/auth/login?message=Password%20reset%20link%20sent.%20Check%20your%20email.')
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.auth.signOut()

  await logAuditAction({
    actorUserId: user?.id,
    action: 'auth.sign_out',
    entityType: 'session',
  })

  redirect('/')
}
