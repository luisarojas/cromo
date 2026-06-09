import { ImageResponse } from 'next/og';

// Default OpenGraph card. Next picks this up automatically and slots it in
// at /opengraph-image, replacing the static og-default.png reference in
// layout metadata. Sized 1200×630 — the broadly-supported sweet spot for
// Facebook, LinkedIn, Slack and Twitter summary_large_image.
export const alt = 'Cromo — World Cup 2026 sticker tracker & trade matcher';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          background: '#0f1115',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'linear-gradient(135deg, #22D3EE 0%, #A78BFA 35%, #F472B6 65%, #FBBF24 100%)',
              borderRadius: 18,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
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
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            Cromo
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              color: '#f4f4f5',
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            Track. Trade. Complete.
          </div>
          <div
            style={{
              color: '#a1a1aa',
              fontSize: 30,
              maxWidth: 920,
              lineHeight: 1.3,
            }}
          >
            Collector-grade tracker and trade matchmaker for the FIFA World Cup 2026 Panini sticker album.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: '#71717a',
            fontSize: 22,
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
