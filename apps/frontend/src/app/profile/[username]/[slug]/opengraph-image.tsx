import { ImageResponse } from 'next/og';
import { INTERNAL_API_URL, SITE_NAME } from '@/lib/seo';

// Per-album share card. Unfurlers fetch this after seeing the og:image meta
// the sibling layout's generateMetadata advertises. We resolve the album
// by slug (passing ?album= so unlisted albums resolve too); if it's gone
// (private, deleted, never existed) we render a branded fallback so a
// stale link still produces a Cromo card, not a 500.

export const alt = 'Cromo album share card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface ProfileAlbum {
  slug: string;
  alias: string | null;
  albumTypeName: string;
  editionName: string;
  formatName: string;
  offered: unknown[];
  wantedCount: number;
}

interface ProfileResponse {
  username: string;
  displayName: string | null;
  tradingInventory: ProfileAlbum[];
}

async function loadProfile(username: string, slug: string): Promise<ProfileResponse | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/v1/profiles/${encodeURIComponent(username)}?album=${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProfileResponse;
  } catch {
    return null;
  }
}

export default async function ProfileAlbumOG({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const profile = await loadProfile(username, slug);
  const album = profile?.tradingInventory.find((a) => a.slug === slug) ?? null;

  const display = profile?.displayName?.trim() || profile?.username || username;
  const handle = profile?.username ?? username;
  const initial = (display || handle).trim().charAt(0).toUpperCase() || '?';
  const albumName = album?.alias ?? album?.albumTypeName ?? null;
  const albumSubtitle = album ? `${album.editionName} · ${album.formatName}` : null;
  const offeredCount = album?.offered?.length ?? 0;
  const wantedCount = album?.wantedCount ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f1115',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand row */}
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

        {/* Identity + album block */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 48,
            marginTop: 24,
          }}
        >
          <div
            style={{
              width: 160,
              height: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'linear-gradient(135deg, #22D3EE 0%, #A78BFA 50%, #F472B6 100%)',
              borderRadius: 80,
              color: '#0f1115',
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: '-0.04em',
            }}
          >
            {initial}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxWidth: 820,
            }}
          >
            <div
              style={{
                color: '#a1a1aa',
                fontSize: 28,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {`@${handle}`}
            </div>
            <div
              style={{
                color: '#f4f4f5',
                fontSize: albumName ? 64 : 56,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
              }}
            >
              {albumName ?? `${display}'s album`}
            </div>
            {albumSubtitle && (
              <div
                style={{
                  color: '#a1a1aa',
                  fontSize: 28,
                }}
              >
                {albumSubtitle}
              </div>
            )}
            {!album && (
              <div style={{ color: '#a1a1aa', fontSize: 26 }}>
                This album is no longer shared
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        {album ? (
          <div
            style={{
              display: 'flex',
              gap: 56,
              borderTop: '1px solid #27272a',
              paddingTop: 28,
            }}
          >
            <Stat value={offeredCount} label="to trade" />
            <Stat value={wantedCount} label="wanted" />
            <div
              style={{
                marginLeft: 'auto',
                color: '#71717a',
                fontSize: 24,
                fontFamily: 'ui-monospace, monospace',
                alignSelf: 'flex-end',
              }}
            >
              cromotrade.ca
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              borderTop: '1px solid #27272a',
              paddingTop: 28,
              color: '#71717a',
              fontSize: 24,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            cromotrade.ca
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          color: '#f4f4f5',
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {value.toLocaleString('en')}
      </div>
      <div style={{ color: '#a1a1aa', fontSize: 22 }}>{label}</div>
    </div>
  );
}
