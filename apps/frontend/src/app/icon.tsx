import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon — solid-accent variant of the Cromo mark. Chrome aliases below ~24px. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6EE7F9',
          borderRadius: '7px',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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
    ),
    { ...size }
  );
}
