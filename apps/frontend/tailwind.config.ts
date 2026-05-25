import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cromo: {
          bg: 'var(--cromo-bg)',
          surface: 'var(--cromo-surface)',
          'surface-2': 'var(--cromo-surface-2)',
          border: 'var(--cromo-border)',
          'border-strong': 'var(--cromo-border-strong)',
          fg: 'var(--cromo-fg)',
          'fg-muted': 'var(--cromo-fg-muted)',
          'fg-subtle': 'var(--cromo-fg-subtle)',
          accent: 'var(--cromo-accent)',
          'accent-strong': 'var(--cromo-accent-strong)',
          'accent-soft': 'var(--cromo-accent-soft)',
          success: 'var(--cromo-success)',
          warning: 'var(--cromo-warning)',
          danger: 'var(--cromo-danger)',
          info: 'var(--cromo-info)',
        },
        tier: {
          common: 'var(--cromo-tier-common)',
          uncommon: 'var(--cromo-tier-uncommon)',
          rare: 'var(--cromo-tier-rare)',
          'very-rare': 'var(--cromo-tier-very-rare)',
          'ultra-rare': 'var(--cromo-tier-ultra-rare)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'cromo-chrome':
          'linear-gradient(135deg, #22D3EE 0%, #A78BFA 35%, #F472B6 65%, #FBBF24 100%)',
        'cromo-chrome-conic':
          'conic-gradient(from 180deg at 50% 50%, #22D3EE 0deg, #A78BFA 90deg, #FBBF24 180deg, #F472B6 270deg, #22D3EE 360deg)',
      },
      keyframes: {
        'cromo-shimmer': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'cromo-shimmer': 'cromo-shimmer 4s ease-in-out infinite',
      },
      borderRadius: {
        chip: '4px',
        btn: '8px',
        card: '12px',
        modal: '20px',
      },
    },
  },
  plugins: [],
}

export default config
