'use client'

import { useFormStatus } from 'react-dom'

export function SyncButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? 'Syncing from SAM.gov...' : 'Sync opportunities from SAM.gov'}
    </button>
  )
}
