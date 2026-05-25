import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { markAllNotificationsRead } from '@/app/notifications/actions'

type NotificationsPageProps = {
  searchParams?: Promise<{
    message?: string
    error?: string
  }>
}

type NotificationRow = {
  id: string
  notification_type: 'new_match' | 'high_match'
  title: string
  body: string
  is_read: boolean
  created_at: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const params = searchParams ? await searchParams : undefined
  const message = params?.message
  const error = params?.error

  if (!isSupabaseConfigured()) {
    redirect('/auth/login?error=Supabase%20is%20not%20configured%20yet')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.is_anonymous) {
    redirect('/dashboard?error=Sign%20in%20to%20access%20notifications')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!company) {
    redirect('/company-profile?error=Create%20your%20company%20profile%20first')
  }

  const { data: notificationsResult } = await supabase
    .from('watchlist_notifications')
    .select('id, notification_type, title, body, is_read, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(150)

  const notifications = (notificationsResult ?? []) as NotificationRow[]
  const unreadCount = notifications.filter((item) => !item.is_read).length

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f8f5,#eef2ff)] px-6 py-16">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Notifications</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Match alerts</h1>
        <p className="mt-3 text-slate-700">
          Track new and high-value opportunity matches as your sync jobs run.
        </p>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
            Unread {unreadCount}
          </span>
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              Mark all as read
            </button>
          </form>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-600">No notifications yet. Run an opportunities sync to generate alerts.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.is_read
                      ? 'rounded-xl border border-slate-200 p-4'
                      : 'rounded-xl border border-accent/40 bg-accent/5 p-4'
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {item.notification_type === 'high_match' ? 'High value' : 'New match'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.body}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
