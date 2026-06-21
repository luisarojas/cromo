import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

// Trade invites are single-use, auth-required tokens — there's no public
// peek endpoint that returns the host's name without consuming the invite,
// so this card stays generic. If we ever expose a non-consuming preview
// route, swap to a personalised "Trade with @host" card.

export const alt = 'Trade with a Cromo collector';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TradeInviteOG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0f1115',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'linear-gradient(135deg, #22D3EE 0%, #A78BFA 35%, #F472B6 65%, #FBBF24 100%)',
              borderRadius: 14,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M16 8.2a5.5 5.5 0 1 0 0 7.6"
                stroke="#FFFFFF"
                strokeWidth="3.4"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="16.5" cy="12" r="1.6" fill="#FFFFFF" />
            </svg>
          </div>
          <div
            style={{
              color: '#f4f4f5',
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              color: '#a1a1aa',
              fontSize: 30,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            }}
          >
            Trade invite
          </div>
          <div
            style={{
              color: '#f4f4f5',
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            Let's trade stickers.
          </div>
          <div
            style={{
              color: '#a1a1aa',
              fontSize: 32,
              lineHeight: 1.3,
              maxWidth: 920,
            }}
          >
            Open this link to start a trade on Cromo.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            color: '#71717a',
            fontSize: 24,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          cromotrade.ca
        </div>
      </div>
    ),
    { ...size },
  );
}
