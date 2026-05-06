import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stickfolio',
  description: '2026 FIFA World Cup Panini Sticker Tracker',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
