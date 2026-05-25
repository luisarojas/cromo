import { ImageResponse } from 'next/og';

// Larger source (64) downsampled by the browser keeps the chrome gradient
// readable at 32px; rendering directly at 32 would dither the gradient.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

/** Favicon — chrome holographic mark, matching the NavBar lockup. */
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
          background:
            'linear-gradient(135deg, #22D3EE 0%, #A78BFA 35%, #F472B6 65%, #FBBF24 100%)',
          borderRadius: '14px',
        }}
      >
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
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
    ),
    { ...size }
  );
}
