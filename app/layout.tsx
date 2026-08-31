import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LTC Rentals CRM',
  description: 'Internal rental operations and CRM application for LTC Rentals'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
