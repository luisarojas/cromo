import type { Metadata } from 'next';
import { Suspense } from 'react';
import StandingsView from './StandingsView';

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 — live standings, bracket & forecasts',
  description:
    'Live group tables, the knockout bracket, and team-by-team forecasts for the FIFA World Cup 2026 — who has qualified, who is out, and who is most likely to lift the trophy.',
  alternates: { canonical: '/guide/wc-2026/standings' },
  keywords: [
    'World Cup 2026 standings',
    'World Cup 2026 bracket',
    'World Cup 2026 groups',
    'World Cup 2026 predictions',
    'FIFA World Cup table',
  ],
};

export default function WC2026StandingsPage() {
  // StandingsView reads ?view= via useSearchParams, which Next requires to be
  // wrapped in Suspense at the page boundary.
  return (
    <Suspense fallback={null}>
      <StandingsView />
    </Suspense>
  );
}
