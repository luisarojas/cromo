import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// next-intl plugin: locates ./src/i18n/request.ts at build time and wires the
// server-side message-loading into the App Router.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const config: NextConfig = {
  output: 'standalone',
  // @cromo/shared compiles to dist/ at container startup (see
  // packages/shared/package.json + apps/*/Dockerfile.local) and exposes
  // standard ESM .js + .d.ts to its consumers, so webpack resolves it like
  // any other npm package — no transpilePackages or extensionAlias needed.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
}

export default withNextIntl(config)
