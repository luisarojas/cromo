'use client';

import { useTranslations } from 'next-intl';
import {
  formatKickoffET,
  pct,
  STAGE_LABELS,
  type WcMatch,
  type WcStandingRow,
  type WcTeamDetail,
} from '@/lib/api';
import { Flag, ProbBar, QualBadge, RankLock, TeamChip, TeamName } from './parts';

const WC_YEAR = 2026;

// The full team profile, shared by the Teams tab and the group-click modal.
export default function TeamDetailPanel({ detail }: { detail: WcTeamDetail }) {
  const t = useTranslations('wc2026Standings');
  const { standing, history } = detail;
  const yearsAgo = history.lastAppearance ? WC_YEAR - history.lastAppearance : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Header + odds */}
      <Panel className="md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-[var(--cromo-fg)]">
              <Flag code={detail.code} className="h-6 w-9" />
              <TeamName code={detail.code} fallback={detail.name} />
            </h2>
            <p className="text-sm text-[var(--cromo-fg-muted)]">
              {t('group', { letter: detail.group })} · {t('rankNth', { rank: standing.rank })}
              <span className="ml-1 inline-flex align-middle">
                <QualBadge status={standing.qualification} />
              </span>
            </p>
          </div>
          <TeamChip code={detail.code} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProbBar value={detail.reachFinalProb} label={t('reachFinal')} />
          <ProbBar value={detail.championProb} label={t('winTournament')} />
        </div>
        {/* WC history folded into the header so it doesn't leave an empty panel. */}
        <p className="mt-3 border-t border-[var(--cromo-border)] pt-3 text-xs text-[var(--cromo-fg-muted)]">
          {t('historyLine', {
            appearances: history.appearances,
            titles: history.titles,
            last:
              yearsAgo === null
                ? t('debut')
                : yearsAgo === 0
                  ? t('current')
                  : `${t('lastApp')} ${history.lastAppearance}`,
          })}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--cromo-fg-subtle)]">{t('methodology')}</p>
      </Panel>

      {/* Group standing — full table with this team highlighted */}
      <Panel className="md:col-span-2">
        <PanelTitle>
          {t('groupStanding')}
          <span className="ml-2 font-normal text-[var(--cromo-fg-muted)]">{t('group', { letter: detail.group })}</span>
        </PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--cromo-fg-subtle)]">
                <th className="px-1.5 py-1 text-left font-semibold">#</th>
                <th className="px-2 py-1 text-left font-semibold">{t('th.team')}</th>
                <th className="px-1.5 py-1 text-center font-semibold" title={t('th.playedHint')}>{t('th.played')}</th>
                <th className="px-1.5 py-1 text-center font-semibold">{t('th.won')}</th>
                <th className="px-1.5 py-1 text-center font-semibold">{t('drawn')}</th>
                <th className="px-1.5 py-1 text-center font-semibold">{t('th.lost')}</th>
                <th className="px-1.5 py-1 text-center font-semibold" title={t('th.gdHint')}>{t('th.gd')}</th>
                <th className="px-2 py-1 text-center font-semibold">{t('th.points')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {detail.groupTable.map((r) => {
                const isYou = r.code === detail.code;
                return (
                  <tr
                    key={r.code}
                    title={isYou ? t('teamRowYou') : undefined}
                    className={
                      isYou
                        ? 'bg-[var(--cromo-accent-soft)] font-semibold ring-1 ring-inset ring-[var(--cromo-accent)]/40'
                        : r.qualification === 'ELIMINATED'
                          ? 'opacity-45'
                          : undefined
                    }
                  >
                    <td className="px-1.5 py-2 text-center">
                      {r.guaranteedRank !== null ? (
                        <RankLock rank={r.guaranteedRank} />
                      ) : (
                        <span className="tabular-nums text-[var(--cromo-fg-subtle)]">{r.rank}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        <Flag code={r.code} />
                        <span className="font-mono text-[10px] text-[var(--cromo-fg-muted)]">{r.code}</span>
                        <span className="truncate text-[var(--cromo-fg)]">
                          <TeamName code={r.code} fallback={r.name} />
                        </span>
                        <QualBadge status={r.qualification} />
                      </span>
                    </td>
                    <Num>{r.played}</Num>
                    <Num>{r.won}</Num>
                    <Num>{r.drawn}</Num>
                    <Num>{r.lost}</Num>
                    <Num>{r.gd > 0 ? `+${r.gd}` : r.gd}</Num>
                    <td className="px-2 py-2 text-center font-bold tabular-nums text-[var(--cromo-fg)]">{r.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--cromo-fg-subtle)]">{t('standingLegend')}</p>
      </Panel>

      {/* Projected opponents — full width (variable height, no awkward neighbor) */}
      <Panel className="md:col-span-2">
        <PanelTitle>{t('projectedOpponents')}</PanelTitle>
        {detail.projectedOpponents.length === 0 ? (
          <Empty>{t('noOpponentsYet')}</Empty>
        ) : (
          <div className="space-y-3">
            {detail.projectedOpponents.map((round) => (
              <div key={round.stage}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-subtle)]">
                  {STAGE_LABELS[round.stage]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {round.opponents.map((o) => (
                    <span
                      key={o.code}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-2.5 py-1 text-xs"
                    >
                      <Flag code={o.code} />
                      <span className="text-[var(--cromo-fg)]">
                        <TeamName code={o.code} fallback={o.name} />
                      </span>
                      <span className="text-[var(--cromo-fg-subtle)] tabular-nums">{pct(o.prob)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Results */}
      <Panel>
        <PanelTitle>{t('results')}</PanelTitle>
        {detail.results.length === 0 ? (
          <Empty>{t('noResults')}</Empty>
        ) : (
          <ul className="space-y-2">
            {detail.results.map((m) => (
              <FixtureRow key={m.id} match={m} code={detail.code} t={t} />
            ))}
          </ul>
        )}
      </Panel>

      {/* Upcoming */}
      <Panel>
        <PanelTitle>{t('upcoming')}</PanelTitle>
        {detail.upcoming.length === 0 ? (
          <Empty>{t('noUpcoming')}</Empty>
        ) : (
          <ul className="space-y-2">
            {detail.upcoming.map((m) => (
              <FixtureRow key={m.id} match={m} code={detail.code} t={t} />
            ))}
          </ul>
        )}
      </Panel>

      {/* Squad */}
      <Panel className="md:col-span-2">
        <PanelTitle>
          {t('players')}
          {detail.players.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--cromo-fg-subtle)]">({detail.players.length})</span>
          )}
        </PanelTitle>
        {detail.players.length === 0 ? (
          <Empty>{t('squadWithLive')}</Empty>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {detail.players.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-2 rounded-lg bg-[var(--cromo-surface-2)] px-3 py-1.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 rounded bg-[var(--cromo-surface)] px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-[var(--cromo-fg-muted)]">
                    {p.position}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--cromo-fg)]">{p.name}</span>
                    {p.club && <span className="block truncate text-[11px] text-[var(--cromo-fg-subtle)]">{p.club}</span>}
                  </span>
                </span>
                {p.age !== null && (
                  <span className="shrink-0 text-xs text-[var(--cromo-fg-subtle)] tabular-nums">{t('ageY', { age: p.age })}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function FixtureRow({
  match,
  code,
  t,
}: {
  match: WcMatch;
  code: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const isHome = match.home.code === code;
  const me = isHome ? match.home : match.away;
  const opp = isHome ? match.away : match.home;
  const finished = match.status === 'FINISHED';
  const stageLabel = match.group ? t('group', { letter: match.group }) : STAGE_LABELS[match.stage];

  let outcome: 'W' | 'D' | 'L' | null = null;
  if (finished && me.score !== null && opp.score !== null) {
    outcome = me.score > opp.score ? 'W' : me.score < opp.score ? 'L' : 'D';
  }
  const outcomeColor =
    outcome === 'W'
      ? 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]'
      : outcome === 'L'
        ? 'bg-[var(--cromo-danger)]/15 text-[var(--cromo-danger)]'
        : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]';

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-9 shrink-0 text-center text-[10px] font-medium uppercase text-[var(--cromo-fg-subtle)]">
          {isHome ? t('homeShort') : t('awayShort')}
        </span>
        {opp.code && <Flag code={opp.code} />}
        <span className="truncate text-[var(--cromo-fg)]">
          {opp.code ? <TeamName code={opp.code} fallback={opp.name} /> : opp.placeholder ?? '—'}
        </span>
        <span className="hidden shrink-0 text-[11px] text-[var(--cromo-fg-subtle)] sm:inline">· {stageLabel}</span>
      </span>
      {finished ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums font-semibold text-[var(--cromo-fg)]">
            {me.score}–{opp.score}
          </span>
          {outcome && (
            <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${outcomeColor}`}>
              {outcome}
            </span>
          )}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-[var(--cromo-fg-subtle)]">{formatKickoffET(match.kickoff)}</span>
      )}
    </li>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <td className="px-1.5 py-2 text-center tabular-nums text-[var(--cromo-fg-muted)]">{children}</td>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 flex items-center text-sm font-bold text-[var(--cromo-fg)]">{children}</h3>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--cromo-fg-muted)]">{children}</p>;
}

