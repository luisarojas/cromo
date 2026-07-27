import type { Metadata } from 'next';
import { Suspense } from 'react';
import StandingsView from './StandingsView';

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 — live standings, bracket & forecasts',
  description:
    'Live group tables, the knockout bracket, and team-by-team forecasts for the FIFA World Cup 2026 — who has qualified, who is out, and who is most likely to lift the trophy.',
  alternates: { canonical: '/guide/standings/wc-2026' },
  keywords: [
    'World Cup 2026 standings',
    'World Cup 2026 bracket',
    'World Cup 2026 groups',
    'World Cup 2026 predictions',
    'FIFA World Cup table',
  ],
};

export default async function StandingsPage({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament } = await params;
  // StandingsView reads ?view= via useSearchParams, which Next requires to be
  // wrapped in Suspense at the page boundary.
  return (
    <Suspense fallback={null}>
      <StandingsView tournament={tournament} />
    </Suspense>
  );
}
