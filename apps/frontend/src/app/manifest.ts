import type { MetadataRoute } from 'next';

// Next 14 metadata-route manifest. Served at /manifest.webmanifest with the
// correct Content-Type. The PWA install prompt depends on this being present
// alongside a registered service worker.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cromo',
    short_name: 'Cromo',
    description:
      'Track every variant, swap duplicates, complete your album.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0B0F',
    theme_color: '#0A0B0F',
    orientation: 'portrait',
    icons: [
      {
        src: '/cromo-mark.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/cromo-mark-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
