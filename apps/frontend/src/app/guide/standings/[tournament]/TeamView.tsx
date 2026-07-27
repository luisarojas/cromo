'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { fetchWcTeam, type GroupQualification, type WcOverview, type WcTeamDetail } from '@/lib/api';
import TeamDetailPanel from './TeamDetailPanel';
import { Flag, QualBadge, TeamName, useTeamName } from './parts';

type QualFilter = 'all' | 'qualified' | 'undecided' | 'disqualified';

// Team tab: search + filter the field, pick a nation → full profile. Selecting a
// team fills the search box (collapsing the list to that one tile) and mirrors
// the choice in the URL (?team=CODE) so a profile is shareable.
export default function TeamView({ overview, tournament }: { overview: WcOverview; tournament: string }) {
  const t = useTranslations('wc2026Standings');
  const teamName = useTeamName();
  const router = useRouter();
  const params = useSearchParams();

  const teams = useMemo(
    () =>
      overview.groups
        .flatMap((g) =>
          g.rows.map((r) => ({ code: r.code, name: r.name, group: g.group, qualification: r.qualification, lastAppearance: r.lastAppearance })),
        )
        .sort((a, b) => teamName(a.code, a.name).localeCompare(teamName(b.code, b.name))),
    [overview, teamName],
  );

  const [query, setQuery] = useState('');
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [qualFilter, setQualFilter] = useState<QualFilter>('all');
  const [lastWcSel, setLastWcSel] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, val: string) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setSet(next);
  };

  const urlTeam = (params.get('team') ?? '').toUpperCase();
  const [code, setCode] = useState<string>(urlTeam && teams.some((tm) => tm.code === urlTeam) ? urlTeam : '');

  const [detail, setDetail] = useState<WcTeamDetail | null>(null);
  const [error, setError] = useState(false);

  const select = (next: string) => {
    setCode(next);
    // Fill the search box with the team's name so the list collapses to its tile.
    const picked = teams.find((tm) => tm.code === next);
    if (picked) setQuery(teamName(picked.code, picked.name));
    const qs = new URLSearchParams(Array.from(params.entries()));
    qs.set('view', 'teams');
    if (next) qs.set('team', next);
    else qs.delete('team');
    router.replace(`?${qs.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!code) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetail(null);
    setError(false);
    fetchWcTeam(tournament, code)
      .then((d) => live && setDetail(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [tournament, code]);

  const groups = useMemo(() => [...new Set(teams.map((tm) => tm.group))].sort(), [teams]);
  const lastWcYears = useMemo(
    () => [...new Set(teams.map((tm) => tm.lastAppearance).filter((y): y is number => y !== null))].sort((a, b) => b - a),
    [teams],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((tm) => {
      const localized = teamName(tm.code, tm.name).toLowerCase();
      if (q && !localized.includes(q) && !tm.name.toLowerCase().includes(q) && !tm.code.toLowerCase().includes(q)) return false;
      if (groupSel.size && !groupSel.has(tm.group)) return false;
      if (qualFilter === 'qualified' && tm.qualification !== 'CLINCHED') return false;
      if (qualFilter === 'undecided' && tm.qualification !== 'ALIVE') return false;
      if (qualFilter === 'disqualified' && tm.qualification !== 'ELIMINATED') return false;
      if (lastWcSel.size) {
        const key = tm.lastAppearance === null ? 'debut' : String(tm.lastAppearance);
        if (!lastWcSel.has(key)) return false;
      }
      return true;
    });
  }, [teams, query, groupSel, qualFilter, lastWcSel, teamName]);

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="space-y-3 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (code) select('');
          }}
          placeholder={t('searchTeams')}
          aria-label={t('searchTeams')}
          className="w-full rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-bg)] px-3 py-2.5 text-sm text-[var(--cromo-fg)] focus:border-[var(--cromo-accent)] focus:outline-none"
        />
        {/* Groups — multi-select chips (empty = all) */}
        <FilterRow label={t('filterGroup')}>
          {groups.map((g) => (
            <Chip key={g} active={groupSel.has(g)} onClick={() => toggle(groupSel, setGroupSel, g)} ariaLabel={t('group', { letter: g })}>
              {g}
            </Chip>
          ))}
        </FilterRow>

        {/* Last World Cup — multi-select chips (empty = any) */}
        <FilterRow label={t('filterLastWc')}>
          {lastWcYears.map((y) => (
            <Chip key={y} active={lastWcSel.has(String(y))} onClick={() => toggle(lastWcSel, setLastWcSel, String(y))}>
              {y}
            </Chip>
          ))}
          <Chip active={lastWcSel.has('debut')} onClick={() => toggle(lastWcSel, setLastWcSel, 'debut')}>
            {t('debutFilter')}
          </Chip>
        </FilterRow>

        {/* Qualification — single-select */}
        <FilterRow label={t('filterStatus')}>
          {(['all', 'qualified', 'undecided', 'disqualified'] as QualFilter[]).map((q) => (
            <Chip key={q} active={qualFilter === q} onClick={() => setQualFilter(q)}>
              {q === 'all' ? t('qual.all') : q === 'qualified' ? t('qual.qualified') : q === 'undecided' ? t('undecided') : t('qual.disqualified')}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {/* Filtered team list */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 text-sm text-[var(--cromo-fg-muted)]">
          {t('noTeamsMatch')}
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {filtered.map((tm) => (
            <li key={tm.code}>
              <button
                type="button"
                onClick={() => select(tm.code)}
                aria-pressed={code === tm.code}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  code === tm.code
                    ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
                    : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:bg-[var(--cromo-surface-2)] active:bg-[var(--cromo-surface-2)]'
                }`}
              >
                <Flag code={tm.code} />
                <span className="font-mono text-[10px] font-semibold text-[var(--cromo-fg-muted)]">{tm.code}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--cromo-fg)]">
                  <TeamName code={tm.code} fallback={tm.name} />
                </span>
                <span className="text-[11px] text-[var(--cromo-fg-subtle)]">{t('group', { letter: tm.group })}</span>
                <QualBadge status={tm.qualification as GroupQualification} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Selected team detail */}
      {code &&
        (error ? (
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 text-sm text-[var(--cromo-fg-muted)]">
            {t('loadError')}
          </div>
        ) : !detail ? (
          <div className="h-64 animate-pulse rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]" />
        ) : (
          <TeamDetailPanel detail={detail} />
        ))}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-subtle)]">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
          : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
      }`}
    >
      {children}
    </button>
  );
}
