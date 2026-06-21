import { ImageResponse } from 'next/og';
import { INTERNAL_API_URL, SITE_NAME } from '@/lib/seo';

// Per-token share card for /share/<token> lists. The backend returns 410 if
// the link has been revoked; we render a branded "expired" card in that
// case so unfurled previews don't surface a 500 to the recipient.

export const alt = 'Cromo shared sticker list';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface ShareListResponse {
  owner: { username: string; displayName: string | null };
  listType: string;
  items: unknown[];
}

const LIST_TYPE_LABEL: Record<string, string> = {
  offered: 'duplicates to trade',
  duplicates: 'duplicates to trade',
  wanted: 'wanted stickers',
  missing: 'wanted stickers',
};

async function loadList(token: string): Promise<ShareListResponse | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/v1/share/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as ShareListResponse;
  } catch {
    return null;
  }
}

export default async function ShareOG({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const list = await loadList(token);

  const ownerName = list?.owner.displayName?.trim() || list?.owner.username || 'A collector';
  const listLabel = list ? (LIST_TYPE_LABEL[list.listType] ?? list.listType.replace(/_/g, ' ')) : null;
  const itemCount = list?.items.length ?? 0;

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

        {list ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                color: '#a1a1aa',
                fontSize: 30,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              Shared list
            </div>
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
              {`${ownerName}'s ${listLabel ?? ''}`.trim()}
            </div>
            <div
              style={{
                color: '#a1a1aa',
                fontSize: 36,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {`${itemCount.toLocaleString('en')} ${itemCount === 1 ? 'sticker' : 'stickers'}`}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              Shared sticker list
            </div>
            <div style={{ color: '#a1a1aa', fontSize: 32, lineHeight: 1.3, maxWidth: 920 }}>
              Open the link to see what this collector has and wants.
            </div>
          </div>
        )}

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
