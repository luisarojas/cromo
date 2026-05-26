// Flat config (ESLint 9). Lints backend TypeScript only — frontend uses
// `next lint` with Next.js's bundled config.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'src/db/migrations/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow intentionally-unused vars prefixed with _ (common pattern for
      // ignored params in callbacks / destructured response objects).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // We use `any` deliberately at boundaries (raw SQL row payloads,
      // Fastify route generic escape hatches). Promote to warn so it shows
      // up but doesn't block.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Drizzle and other libs sometimes emit `{}` as a placeholder type;
      // leave it alone.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
