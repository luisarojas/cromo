import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// next-intl plugin: locates ./src/i18n/request.ts at build time and wires the
// server-side message-loading into the App Router.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const config: NextConfig = {
  output: 'standalone',
  // @cromo/shared ships raw TypeScript and its re-exports use NodeNext-style
  // `.js` extensions so the backend (module: "NodeNext") can resolve them at
  // runtime. transpilePackages routes the package through SWC for compilation
  // and the extensionAlias below teaches webpack to map those `.js` import
  // specifiers to the actual `.ts` files on disk. Required for any *value*
  // import from @cromo/shared (type-only imports get erased before webpack
  // sees them and so don't trigger the resolution).
  transpilePackages: ['@cromo/shared'],
  webpack: (cfg) => {
    cfg.resolve = cfg.resolve ?? {}
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return cfg
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
}

export default withNextIntl(config)
