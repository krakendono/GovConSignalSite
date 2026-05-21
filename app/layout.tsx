import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GovSignal AI',
  description: 'AI-powered federal contract intelligence and proposal preparation.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
