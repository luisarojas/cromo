'use client';

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  dateSpanET,
  formatKickoffET,
  KNOCKOUT_ORDER,
  pct,
  placeholderCandidates,
  shortPlaceholder,
  STAGE_LABELS,
  type WcGroupStanding,
  type WcMatch,
  type WcMatchSide,
  type WcOverview,
  type WcStage,
} from '@/lib/api';
import { Flag, TeamName } from './parts';

// Bracket view: knockout rounds as columns left→right, joined into a tree by
// connector gutters. Hovering/focusing a tile highlights the whole path to the
// final; clicking a team name opens its profile modal. Tiles have generous
// vertical spacing and scroll horizontally on small screens.

const COLUMN_W = 'w-64';
const GUTTER_W = 'w-10';
const SLOT_MIN_H = 'min-h-[140px]';
const HEADER_H = 'h-12';

type Hover = { round: number; slot: number } | null;

export default function BracketView({
  overview,
  onSelectTeam,
}: {
  overview: WcOverview;
  onSelectTeam: (code: string) => void;
}) {
  const t = useTranslations('wc2026Standings');
  // Lay each round out as a proper bracket TREE derived from the feeds, so the
  // matches the connectors join (positionally-adjacent rows 2i,2i+1 → parent i)
  // are the ones that ACTUALLY feed the next round. ESPN orders matches
  // chronologically (slot), not by tree position — e.g. R16 #0 is fed by R32 #0
  // and #2, not #0 and #1 — so rendering by slot drew connectors between matches
  // that don't feed each other. We walk FINAL → R32, ordering each stage by its
  // parents' `W:STAGE:n` feeds; if the feeds don't reconstruct a full tree
  // (football-data fallback has none) we fall back to slot order.
  const rounds = useMemo(() => {
    const present = KNOCKOUT_ORDER.filter((stage) => overview.bracket.some((m) => m.stage === stage));
    const slotSorted = (stage: WcStage) =>
      overview.bracket.filter((m) => m.stage === stage).sort((a, b) => a.slot - b.slot);

    const bySlot = new Map<string, WcMatch>();
    for (const m of overview.bracket) bySlot.set(`${m.stage}:${m.slot}`, m);
    const feederOf = (feed: string | null): WcMatch | undefined => {
      const mm = /^[WL]:(\w+):(\d+)$/.exec(feed ?? '');
      return mm ? bySlot.get(`${mm[1]}:${mm[2]}`) : undefined;
    };

    const chain: WcStage[] = ['FINAL', 'SF', 'QF', 'R16', 'R32'];
    const ordered: Partial<Record<WcStage, WcMatch[]>> = {};
    const root = overview.bracket.find((m) => m.stage === 'FINAL');
    let treeOk = Boolean(root);
    if (root) {
      ordered.FINAL = [root];
      for (let i = 0; i < chain.length - 1 && treeOk; i += 1) {
        const kids: WcMatch[] = [];
        for (const parent of ordered[chain[i]] ?? []) {
          for (const feed of [parent.home.feed, parent.away.feed]) {
            const m = feederOf(feed);
            if (m) kids.push(m);
          }
        }
        // Trust the tree only if it recovered every match in the child stage.
        if (kids.length !== slotSorted(chain[i + 1]).length) treeOk = false;
        else ordered[chain[i + 1]] = kids;
      }
    }

    return present.map((stage) => ({
      stage,
      matches: treeOk && ordered[stage] ? ordered[stage]! : slotSorted(stage),
    }));
  }, [overview]);
  const third = overview.bracket.filter((m) => m.stage === 'THIRD');

  const [hover, setHover] = useState<Hover>(null);

  // Path from a hovered tile up to the final: tile (r, slot) feeds (r+1, slot/2).
  // Correct because `rounds` is in tree-layout order (above), so display index
  // 2i,2i+1 really are the children of parent i.
  const path = useMemo(() => {
    const tiles = new Set<string>();
    const connectors = new Set<string>();
    if (!hover) return { tiles, connectors };
    let { round, slot } = hover;
    while (round < rounds.length) {
      tiles.add(`${round}:${slot}`);
      const parent = Math.floor(slot / 2);
      if (round + 1 < rounds.length) connectors.add(`${round}:${parent}`);
      round += 1;
      slot = parent;
    }
    return { tiles, connectors };
  }, [hover, rounds.length]);

  const active = hover !== null;

  return (
    <div className="space-y-6">
      {/* overflow-y-hidden stops the panel from sprouting its OWN vertical
          scrollbar: `overflow-x-auto` alone makes the browser compute overflow-y
          to `auto`, so a horizontal scrollbar (in always-show-scrollbars mode)
          steals a few px of height and triggers a nested vertical scrollbar.
          The box is exactly as tall as its content, so nothing meaningful clips;
          the page handles vertical scrolling. */}
      <div className="overflow-x-auto overflow-y-hidden pb-3">
        <div className="flex min-w-max items-stretch">
          {rounds.map((round, ri) => (
            <div key={round.stage} className="flex flex-col">
              <div className={`mb-2 ${HEADER_H} px-1`}>
                <h3 className="text-sm font-bold text-[var(--cromo-fg)]">{STAGE_LABELS[round.stage]}</h3>
                <p className="text-[11px] text-[var(--cromo-fg-subtle)]">{dateSpanET(round.matches)} ET</p>
              </div>
              <div className="flex flex-1">
                <div className={`${COLUMN_W} flex flex-col`}>
                  {round.matches.map((m, si) => {
                    const onPath = path.tiles.has(`${ri}:${si}`);
                    return (
                      <div key={m.id} className={`flex flex-1 items-center px-1.5 ${SLOT_MIN_H}`}>
                        <MatchCard
                          match={m}
                          groups={overview.groups}
                          bracket={overview.bracket}
                          dim={active && !onPath}
                          highlight={onPath}
                          onSelectTeam={onSelectTeam}
                          onHover={() => setHover({ round: ri, slot: si })}
                          onHoverEnd={() => setHover(null)}
                          t={t}
                        />
                      </div>
                    );
                  })}
                </div>
                {ri < rounds.length - 1 && (
                  <ConnectorGutter count={round.matches.length} roundIdx={ri} active={active} pathConnectors={path.connectors} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {third.length > 0 && (
        <div className="max-w-sm">
          <h3 className="mb-2 text-sm font-bold text-[var(--cromo-fg)]">{STAGE_LABELS.THIRD}</h3>
          <MatchCard match={third[0]} groups={overview.groups} bracket={overview.bracket} onSelectTeam={onSelectTeam} t={t} />
        </div>
      )}
    </div>
  );
}

function ConnectorGutter({
  count,
  roundIdx,
  active,
  pathConnectors,
}: {
  count: number;
  roundIdx: number;
  active: boolean;
  pathConnectors: Set<string>;
}) {
  const pairs = Math.floor(count / 2);
  return (
    <div className={`${GUTTER_W} relative`} aria-hidden>
      {Array.from({ length: pairs }, (_, i) => {
        const topV = ((2 * i + 0.5) / count) * 100;
        const heightV = (1 / count) * 100;
        const topH = ((2 * i + 1) / count) * 100;
        const on = pathConnectors.has(`${roundIdx}:${i}`);
        const color = on ? 'var(--cromo-accent)' : 'var(--cromo-border)';
        const opacity = active && !on ? 0.3 : 1;
        return (
          <Fragment key={i}>
            <span className="absolute" style={{ left: 0, top: `${topV}%`, height: `${heightV}%`, width: on ? 3 : 2, background: color, opacity }} />
            <span className="absolute" style={{ left: 0, top: `${topH}%`, width: '100%', height: on ? 3 : 2, background: color, opacity }} />
          </Fragment>
        );
      })}
    </div>
  );
}

function MatchCard({
  match,
  groups,
  bracket,
  dim,
  highlight,
  onSelectTeam,
  onHover,
  onHoverEnd,
  t,
}: {
  match: WcMatch;
  groups: WcGroupStanding[];
  bracket: WcMatch[];
  dim?: boolean;
  highlight?: boolean;
  onSelectTeam: (code: string) => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const fav = match.favourite;
  return (
    <article
      // Highlight the path only while pointing at the tile itself, not the gap
      // around it. Keyboard focus within the card also triggers it.
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      className={`w-full rounded-xl border bg-[var(--cromo-surface)] p-2.5 text-sm shadow-sm transition-all ${
        highlight ? 'border-[var(--cromo-accent)] ring-1 ring-[var(--cromo-accent)]' : 'border-[var(--cromo-border)]'
      } ${dim ? 'opacity-40' : 'opacity-100'}`}
    >
      <SideRow side={match.home} winner={match.winnerCode === match.home.code} groups={groups} bracket={bracket} onSelectTeam={onSelectTeam} t={t} />
      <div className="my-1 border-t border-dashed border-[var(--cromo-border)]" />
      <SideRow side={match.away} winner={match.winnerCode === match.away.code} groups={groups} bracket={bracket} onSelectTeam={onSelectTeam} t={t} />

      <div className="mt-1.5 space-y-0.5 border-t border-[var(--cromo-border)] pt-1.5 text-[10px] leading-tight text-[var(--cromo-fg-subtle)]">
        <p>{formatKickoffET(match.kickoff)}</p>
        <p className="truncate">
          {match.city} · {match.stadium}
        </p>
        {match.status !== 'FINISHED' && fav && (
          <p className="text-[var(--cromo-fg-muted)]">{t('favourite', { code: fav.code, pct: pct(fav.prob) })}</p>
        )}
      </div>
    </article>
  );
}

function SideRow({
  side,
  winner,
  groups,
  bracket,
  onSelectTeam,
  t,
}: {
  side: WcMatchSide;
  winner: boolean;
  groups: WcGroupStanding[];
  bracket: WcMatch[];
  onSelectTeam: (code: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (side.code !== null) {
    const code = side.code;
    return (
      <div className={`flex items-center justify-between gap-2 ${winner ? 'font-bold' : ''}`}>
        <button
          type="button"
          onClick={() => onSelectTeam(code)}
          aria-label={t('openTeam', { team: side.name ?? code })}
          className="flex min-w-0 items-center gap-2 rounded text-left hover:underline focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
        >
          <Flag code={code} />
          <span className="font-mono text-[10px] font-semibold text-[var(--cromo-fg-muted)]">{code}</span>
          <span className="truncate text-[var(--cromo-fg)]">
            <TeamName code={code} fallback={side.name} />
          </span>
        </button>
        <span className="tabular-nums text-[var(--cromo-fg)]">
          {side.score ?? ''}
          {side.pens !== null && <span className="text-[10px] text-[var(--cromo-fg-subtle)]"> ({side.pens})</span>}
        </span>
      </div>
    );
  }

  const candidates = placeholderCandidates(side.feed, groups, bracket);
  // Deep rounds can have many possible teams (the final's whole half of the
  // draw); cap the popover and summarise the rest so it stays compact.
  const MAX_SHOWN = 12;
  const shown = candidates.slice(0, MAX_SHOWN);
  const extra = candidates.length - shown.length;
  const titleAttr = candidates.length ? `${t('couldFace')} ${candidates.map((c) => c.name).join(', ')}` : undefined;
  return (
    <div className="group relative flex items-center justify-between gap-2">
      <span
        tabIndex={candidates.length ? 0 : undefined}
        title={titleAttr}
        className="truncate rounded text-[var(--cromo-fg-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
      >
        <span className="font-mono text-xs italic">{shortPlaceholder(side.feed ?? side.placeholder)}</span>
      </span>
      {candidates.length > 0 && (
        <span className="pointer-events-none invisible absolute left-0 top-full z-20 mt-1 w-max max-w-[14rem] rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-bg)] p-2 text-left shadow-lg group-hover:visible group-focus-within:visible">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-subtle)]">
            {t('couldFace')} ({candidates.length})
          </span>
          <span className="flex flex-col gap-1">
            {shown.map((c) => (
              <span key={c.code} className="flex items-center gap-1.5 text-xs">
                <Flag code={c.code} />
                <span className="text-[var(--cromo-fg)]">
                  <TeamName code={c.code} fallback={c.name} />
                </span>
              </span>
            ))}
            {extra > 0 && <span className="text-[10px] text-[var(--cromo-fg-subtle)]">+{extra} more</span>}
          </span>
        </span>
      )}
    </div>
  );
}
