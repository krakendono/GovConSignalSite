export function getConfiguredAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function isLocalAdminBypassEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ADMIN_DEV_BYPASS === 'true'
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false
  }

  const admins = getConfiguredAdminEmails()
  return admins.includes(email.toLowerCase())
}

export function canAccessAdmin(email: string | null | undefined) {
  return isAdminEmail(email) || isLocalAdminBypassEnabled()
}
