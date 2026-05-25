import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/auth/login?error=Supabase%20is%20not%20configured%20yet', request.url))
  }

  const url = new URL(request.url)
  const email = (url.searchParams.get('email') ?? 'm@s.com').trim()

  const supabase = await createSupabaseServerClient()

  const adminClient = createSupabaseAdminClient()
  const { data: userListData, error: userListError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (userListError) {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(userListError.message)}`, request.url))
  }

  const existingUser = userListData.users.find((candidate) => (candidate.email ?? '').toLowerCase() === email.toLowerCase())

  if (!existingUser) {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(`No account found for ${email}`)}`, request.url))
  }

  const headerStore = await headers()
  const origin = headerStore.get('origin') ?? `${url.protocol}//${url.host}`

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData.properties?.email_otp) {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(linkError?.message ?? 'Unable to generate local login token')}`, request.url))
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'magiclink',
  })

  if (verifyError) {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(verifyError.message)}`, request.url))
  }

  return NextResponse.redirect(new URL(`/dashboard?message=Signed%20in%20as%20${encodeURIComponent(email)}`, origin))
}