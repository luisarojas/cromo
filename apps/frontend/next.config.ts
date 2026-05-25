import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// next-intl plugin: locates ./src/i18n/request.ts at build time and wires the
// server-side message-loading into the App Router.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const config: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
}

export default withNextIntl(config)
