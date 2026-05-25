import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon — chrome-gradient variant of the Cromo mark on a dark backdrop. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0B0F',
        }}
      >
        <div
          style={{
            width: '140px',
            height: '140px',
            borderRadius: '32px',
            background:
              'linear-gradient(135deg, #22D3EE 0%, #A78BFA 35%, #F472B6 65%, #FBBF24 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="100" height="100" viewBox="0 0 24 24" fill="none">
            <path
              d="M16 8.2a5.5 5.5 0 1 0 0 7.6"
              stroke="#0A0B0F"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="16.5" cy="12" r="1.4" fill="#0A0B0F" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
