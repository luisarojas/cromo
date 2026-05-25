'use client';

// global-error replaces the root layout when an error escapes every nested
// error boundary, so it must render its own <html> + <body>. Keep the markup
// minimal — the layout (fonts, theme, providers) is unavailable here.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#0f1115',
          color: '#f4f4f5',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#f87171',
              margin: 0,
            }}
          >
            fatal · the app crashed
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>
            Cromo couldn&apos;t recover this session
          </h1>
          <p style={{ maxWidth: 480, marginTop: 12, color: '#a1a1aa' }}>
            Reload to start fresh. The error has been logged.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                color: '#a1a1aa',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '10px 20px',
              borderRadius: 999,
              border: 'none',
              background: '#6366f1',
              color: 'white',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
