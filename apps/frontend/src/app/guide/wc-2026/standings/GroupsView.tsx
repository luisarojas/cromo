'use client';

import { useTranslations } from 'next-intl';
import type { WcGroupStanding, WcOverview } from '@/lib/api';
import { Flag, QualBadge, RankLock, TeamName } from './parts';

// Group view: 12 group tables, teams ordered by the backend (points → GD → GF),
// with clinched / eliminated certainty badges. Clicking a row opens the team
// modal. Responsive grid of cards.
export default function GroupsView({
  overview,
  onSelectTeam,
}: {
  overview: WcOverview;
  onSelectTeam: (code: string) => void;
}) {
  const t = useTranslations('wc2026Standings');
  return (
    // Single column through tablet widths — two side-by-side group tables only
    // get enough room to breathe at `lg`. Below that each table is full-width,
    // so it never has to scroll horizontally inside a cramped half-column.
    <div className="grid gap-4 lg:grid-cols-2">
      {overview.groups.map((g) => (
        <GroupCard
          key={g.group}
          group={g}
          groupLabel={t('group', { letter: g.group })}
          onSelectTeam={onSelectTeam}
          t={t}
        />
      ))}
    </div>
  );
}

function GroupCard({
  group,
  groupLabel,
  onSelectTeam,
  t,
}: {
  group: WcGroupStanding;
  groupLabel: string;
  onSelectTeam: (code: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--cromo-border)] px-4 py-2.5">
        <h3 className="text-sm font-bold text-[var(--cromo-fg)]">{groupLabel}</h3>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[var(--cromo-fg-subtle)]">
            <th className="px-3 py-1.5 text-left font-semibold">{t('th.team')}</th>
            <th className="px-1.5 py-1.5 text-center font-semibold" title={t('th.playedHint')}>{t('th.played')}</th>
            {/* Won/Lost are the lowest-value columns; hide them on phones so the
                table fits without horizontal scroll. Played, GD and Points stay. */}
            <th className="hidden px-1.5 py-1.5 text-center font-semibold sm:table-cell">{t('th.won')}</th>
            <th className="hidden px-1.5 py-1.5 text-center font-semibold sm:table-cell">{t('th.lost')}</th>
            <th className="px-1.5 py-1.5 text-center font-semibold" title={t('th.gdHint')}>{t('th.gd')}</th>
            <th className="px-2.5 py-1.5 text-center font-semibold">{t('th.points')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--cromo-border)]">
          {group.rows.map((r) => (
            <tr
              key={r.code}
              onClick={() => onSelectTeam(r.code)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelectTeam(r.code))}
              tabIndex={0}
              role="button"
              aria-label={t('openTeam', { team: r.name })}
              className={`cursor-pointer transition-colors hover:bg-[var(--cromo-surface-2)] focus:bg-[var(--cromo-surface-2)] focus:outline-none ${
                r.qualification === 'ELIMINATED' ? 'opacity-45' : r.rank <= 2 ? 'bg-[var(--cromo-success-soft)]/30' : ''
              }`}
            >
              <td className="px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  {/* The rank number itself turns into an accent badge when the
                      team's final position is mathematically locked. */}
                  {r.guaranteedRank !== null ? (
                    <RankLock rank={r.guaranteedRank} />
                  ) : (
                    <span className="w-4 text-center text-[11px] tabular-nums text-[var(--cromo-fg-subtle)]">{r.rank}</span>
                  )}
                  <Flag code={r.code} />
                  <span className="font-mono text-[11px] font-semibold text-[var(--cromo-fg-muted)]">
                    {r.code}
                  </span>
                  <span className="truncate text-[var(--cromo-fg)]">
                    <TeamName code={r.code} fallback={r.name} />
                  </span>
                  <QualBadge status={r.qualification} />
                </span>
              </td>
              <td className="px-1.5 py-2 text-center tabular-nums text-[var(--cromo-fg-muted)]">{r.played}</td>
              <td className="hidden px-1.5 py-2 text-center tabular-nums text-[var(--cromo-fg-muted)] sm:table-cell">{r.won}</td>
              <td className="hidden px-1.5 py-2 text-center tabular-nums text-[var(--cromo-fg-muted)] sm:table-cell">{r.lost}</td>
              <td className="px-1.5 py-2 text-center tabular-nums text-[var(--cromo-fg-muted)]">
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </td>
              <td className="px-2.5 py-2 text-center font-bold tabular-nums text-[var(--cromo-fg)]">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
