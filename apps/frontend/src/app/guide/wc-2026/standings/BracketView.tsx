'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Flag, TeamName, useTeamName } from './parts';

// Bracket view: a two-sided wallchart on desktop — each half of the draw
// advances from the outer edge toward the FINAL column in the middle, joined
// into a tree by connector gutters. (A non-canonical bracket shape falls back
// to a linear left→right tree.) Hovering/focusing a tile highlights the whole
// path to the final; hovering a round heading highlights that round's tiles;
// clicking a team name opens its profile modal.
//
// A team filter (works on both layouts) highlights where one nation plays —
// and, because the knockout draw is mostly placeholders until the groups end,
// also the rounds it *could still reach* (via `placeholderCandidates`). On
// desktop the tree dims the rest; on mobile the round list collapses to just the
// matching matches. Mobile rounds are also independently collapsible.

const COLUMN_W = 'w-64';
const GUTTER_W = 'w-10';
const SLOT_MIN_H = 'min-h-[112px]';
const HEADER_H = 'h-12';

type Hover = { round: number; slot: number } | null;
type Involve = 'definite' | 'possible' | 'none';

/** How a team relates to a knockout match: it's actually IN it (`definite`), it
 * could still land in one of the slots (`possible`), or neither (`none`). */
function involvementOf(match: WcMatch, focus: string, groups: WcGroupStanding[], bracket: WcMatch[]): Involve {
  if (match.home.code === focus || match.away.code === focus) return 'definite';
  const candidates = [
    ...placeholderCandidates(match.home.feed, groups, bracket),
    ...placeholderCandidates(match.away.feed, groups, bracket),
  ];
  return candidates.some((c) => c.code === focus) ? 'possible' : 'none';
}

export default function BracketView({
  overview,
  onSelectTeam,
}: {
  overview: WcOverview;
  onSelectTeam: (code: string) => void;
}) {
  const t = useTranslations('wc2026Standings');
  const teamName = useTeamName();
  // Lay each round out as a proper bracket TREE derived from the feeds, so the
  // matches the connectors join (positionally-adjacent rows 2i,2i+1 → parent i)
  // are the ones that ACTUALLY feed the next round. ESPN orders matches
  // chronologically (slot), not by tree position — e.g. R16 #0 is fed by R32 #0
  // and #2, not #0 and #1 — so rendering by slot drew connectors between matches
  // that don't feed each other. We walk FINAL → R32, ordering each stage by its
  // parents' `W:STAGE:n` feeds, and back-fill any child a feed left unclaimed
  // (or double-claimed) by elimination — so a live game ESPN hasn't wired into
  // the next round yet still lands in its true slot. Only if that can't form a
  // full tree (football-data has no feeds) do we fall back to slot order.
  const rounds = useMemo(() => {
    const present = KNOCKOUT_ORDER.filter((stage) => overview.bracket.some((m) => m.stage === stage));
    const slotSorted = (stage: WcStage) =>
      overview.bracket.filter((m) => m.stage === stage).sort((a, b) => a.slot - b.slot);

    const bySlot = new Map<string, WcMatch>();
    for (const m of overview.bracket) bySlot.set(`${m.stage}:${m.slot}`, m);
    // Which earlier-round match feeds a parent's side. Prefer the structured
    // feed ("W:R32:2"); but once a side is decided ESPN replaces its feed with
    // the team's code, so fall back to the child-round match that team PLAYED
    // IN (it's a participant in exactly one). We match participation, not
    // `winnerCode`: ESPN sometimes advances a team into the next round before it
    // flags the feeder match FINISHED, so a winner-only lookup misses that one
    // child — the count check then trips and the whole tree silently reverts to
    // (chronological) slot order, drawing connectors between matches that don't
    // actually feed each other.
    const feederOf = (side: WcMatchSide, pool: WcMatch[]): WcMatch | undefined => {
      const mm = /^[WL]:(\w+):(\d+)$/.exec(side.feed ?? '');
      if (mm) return bySlot.get(`${mm[1]}:${mm[2]}`);
      if (side.code) return pool.find((m) => m.home.code === side.code || m.away.code === side.code);
      return undefined;
    };

    const chain: WcStage[] = ['FINAL', 'SF', 'QF', 'R16', 'R32'];
    const ordered: Partial<Record<WcStage, WcMatch[]>> = {};
    const root = overview.bracket.find((m) => m.stage === 'FINAL');
    let treeOk = Boolean(root);
    if (root) {
      ordered.FINAL = [root];
      for (let i = 0; i < chain.length - 1 && treeOk; i += 1) {
        const pool = slotSorted(chain[i + 1]);
        const poolIds = new Set(pool.map((m) => m.id));
        const parents = ordered[chain[i]] ?? [];
        // Resolve each parent's two sides to a DISTINCT child, claiming greedily
        // so no child is taken twice. ESPN's live feed sometimes points both
        // sides of a parent at the same child — a QF reads "ARG vs W:R16:7"
        // while ARG *is* the winner of R16:7, so the home (by team) and the away
        // (by feed) both hit that one R16 match. The second side is left as a
        // hole rather than duplicating the child.
        const claimed = new Set<string>();
        const pairs: (WcMatch | null)[][] = parents.map((parent) => {
          const pair: (WcMatch | null)[] = [null, null];
          [parent.home, parent.away].forEach((side, si) => {
            const m = feederOf(side, pool);
            if (m && poolIds.has(m.id) && !claimed.has(m.id)) {
              pair[si] = m;
              claimed.add(m.id);
            }
          });
          return pair;
        });
        // Back-fill the holes from the children no side claimed. In the ESPN
        // case exactly one child is orphaned (the sibling ESPN hasn't wired up
        // yet — the live game) and exactly one hole waits for it, so elimination
        // recovers the TRUE feeder and its connector. With no feeds at all
        // (football-data) every side is a hole and this degrades to slot-order
        // pairing. Deterministic: orphans are consumed in slot order.
        const orphans = pool.filter((m) => !claimed.has(m.id));
        let oi = 0;
        for (const pair of pairs) {
          for (let si = 0; si < 2; si += 1) {
            if (pair[si] === null && oi < orphans.length) pair[si] = orphans[oi++]!;
          }
        }
        const kids = pairs.flat().filter((m): m is WcMatch => m !== null);
        // Trust the reconstruction only if it's a true bijection onto the child
        // stage — every match covered exactly once. Otherwise fall the whole
        // tree back to slot order, which still lists every match once.
        const ids = new Set(kids.map((m) => m.id));
        if (kids.length !== pool.length || ids.size !== pool.length) treeOk = false;
        else ordered[chain[i + 1]] = kids;
      }
    }

    return present.map((stage) => ({
      stage,
      matches: treeOk && ordered[stage] ? ordered[stage]! : slotSorted(stage),
    }));
  }, [overview]);
  const third = useMemo(() => overview.bracket.filter((m) => m.stage === 'THIRD'), [overview]);

  // ─── Team filter ───
  // The selection lives in the URL (`?team=`), shared with the Teams tab, so a
  // filtered bracket is shareable and the choice carries across tabs.
  const router = useRouter();
  const params = useSearchParams();
  const teams = useMemo(
    () =>
      overview.groups
        .flatMap((g) => g.rows.map((r) => ({ code: r.code, name: r.name })))
        .sort((a, b) => teamName(a.code, a.name).localeCompare(teamName(b.code, b.name))),
    [overview, teamName],
  );
  const urlTeam = (params.get('team') ?? '').toUpperCase();
  const [focus, setFocus] = useState<string>(urlTeam && teams.some((tm) => tm.code === urlTeam) ? urlTeam : '');
  const setFilter = (next: string) => {
    setFocus(next);
    const qs = new URLSearchParams(Array.from(params.entries()));
    qs.set('view', 'bracket');
    next ? qs.set('team', next) : qs.delete('team');
    router.replace(`?${qs.toString()}`, { scroll: false });
  };
  const involveMap = useMemo(() => {
    const map = new Map<string, Involve>();
    if (!focus) return map;
    for (const m of overview.bracket) map.set(m.id, involvementOf(m, focus, overview.groups, overview.bracket));
    return map;
  }, [focus, overview]);
  const filtering = focus !== '';
  const involveOf = (m: WcMatch): Involve => (filtering ? (involveMap.get(m.id) ?? 'none') : 'none');

  // When a team is filtered, scroll the desktop tree so its first match (a
  // definite slot, else the earliest round it could reach) is in view — the
  // highlighted tile can otherwise sit off-screen in the horizontal scroller.
  const scrollTargetId = useMemo(() => {
    if (!filtering) return null;
    let firstPossible: string | null = null;
    for (const r of rounds) {
      for (const m of r.matches) {
        const inv = involveMap.get(m.id);
        if (inv === 'definite') return m.id;
        if (inv === 'possible' && !firstPossible) firstPossible = m.id;
      }
    }
    return firstPossible;
  }, [filtering, rounds, involveMap]);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const scrollTileRef = useRef<HTMLDivElement | null>(null);
  // Centre the target tile HORIZONTALLY within the panel only — never touch the
  // vertical axis. `scrollIntoView` would walk every scrollable ancestor,
  // including the page, and yank the whole (now full-height) bracket up or down
  // on every filter change. We scroll the panel's own `scrollLeft` instead.
  useEffect(() => {
    const box = scrollBoxRef.current;
    const tile = scrollTileRef.current;
    if (!scrollTargetId || !box || !tile) return;
    const boxRect = box.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const delta = tileRect.left - boxRect.left - (box.clientWidth - tile.clientWidth) / 2;
    box.scrollBy({ left: delta, behavior: 'smooth' });
  }, [scrollTargetId]);

  // Whether the active filter matched any knockout match at all (false when an
  // eliminated team is picked) — drives the empty state on BOTH layouts.
  const filteredEmpty = filtering && involveMap.size > 0 && ![...involveMap.values()].some((v) => v !== 'none');

  // ─── Mobile round collapse ───
  const allStages = useMemo<WcStage[]>(
    () => [...rounds.map((r) => r.stage), ...(third.length ? (['THIRD'] as WcStage[]) : [])],
    [rounds, third],
  );
  // Default: collapse rounds that are entirely played, so the upcoming stages
  // sit front-and-centre instead of behind a wall of finished results. Computed
  // once on mount; the user can still expand/collapse freely afterwards.
  const [collapsed, setCollapsed] = useState<Set<WcStage>>(() => {
    const finished = new Set<WcStage>();
    const isDone = (ms: WcMatch[]) => ms.length > 0 && ms.every((m) => m.status === 'FINISHED');
    for (const r of rounds) if (isDone(r.matches)) finished.add(r.stage);
    if (isDone(third)) finished.add('THIRD');
    return finished;
  });
  const toggleStage = (stage: WcStage) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });
  };

  // Mobile sections: knockout rounds plus the third-place match. When a filter
  // is active we drop rounds the team can't appear in and force the rest open.
  const mobileSections = useMemo(() => {
    const secs: { stage: WcStage; matches: WcMatch[] }[] = rounds.map((r) => ({ stage: r.stage, matches: r.matches }));
    if (third.length) secs.push({ stage: 'THIRD', matches: third });
    if (!filtering) return secs;
    return secs
      .map((s) => ({ stage: s.stage, matches: s.matches.filter((m) => involveMap.get(m.id) !== 'none') }))
      .filter((s) => s.matches.length > 0);
  }, [rounds, third, filtering, involveMap]);

  const [hover, setHover] = useState<Hover>(null);
  // Hovering a round HEADING highlights every tile of that round (both halves
  // in the two-sided layout) and dims the rest — with the canvas scrolled, this
  // is how a reader ties a strip of tiles back to its round.
  const [roundHover, setRoundHover] = useState<WcStage | null>(null);

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

  // Desktop dims the tree whenever a path is highlighted, a round heading is
  // hovered, OR a team is filtered.
  const active = hover !== null || roundHover !== null || filtering;

  // ─── Two-sided (wallchart) layout ───
  // The classic World Cup chart: the two halves of the draw advance from the
  // outer edges toward a single FINAL column in the middle. Only possible when
  // the bracket is a full binary tree (each round exactly halves into the
  // next, one final) — any other shape falls back to the linear left→right
  // tree so a degraded feed still renders.
  const canMirror = useMemo(() => {
    if (rounds.length < 2) return false;
    const last = rounds[rounds.length - 1]!;
    if (last.stage !== 'FINAL' || last.matches.length !== 1) return false;
    for (let i = 0; i < rounds.length - 1; i += 1) {
      if (rounds[i]!.matches.length !== 2 * rounds[i + 1]!.matches.length) return false;
    }
    return true;
  }, [rounds]);
  const preRounds = canMirror ? rounds.slice(0, -1) : [];
  const finalRoundIdx = rounds.length - 1;
  const finalMatch = canMirror ? rounds[finalRoundIdx]!.matches[0]! : null;

  // Tile cell shared by both desktop layouts. `slot` is the GLOBAL tree index
  // within the round (right-half columns pass an offset), so the hover-path
  // keys line up with `path` regardless of which side the tile renders on.
  const renderTile = (m: WcMatch, ri: number, slot: number) => {
    const inv = involveOf(m);
    const onPath = path.tiles.has(`${ri}:${slot}`);
    const roundOn = roundHover === m.stage;
    const dim = filtering ? inv === 'none' : active && !onPath && !roundOn;
    const highlight = filtering ? inv === 'definite' : onPath || roundOn;
    return (
      <div
        key={m.id}
        ref={m.id === scrollTargetId ? scrollTileRef : undefined}
        className={`flex flex-1 items-center px-1.5 ${SLOT_MIN_H}`}
      >
        <MatchCard
          match={m}
          groups={overview.groups}
          bracket={overview.bracket}
          dim={dim}
          highlight={highlight}
          possible={filtering && inv === 'possible'}
          onSelectTeam={onSelectTeam}
          onHover={() => !filtering && setHover({ round: ri, slot })}
          onHoverEnd={() => !filtering && setHover(null)}
          t={t}
        />
      </div>
    );
  };

  // Sticky within the desktop scroller, so the round labels stay attached to
  // their columns while the reader scrolls the tall canvas. Hovering a heading
  // lights up that round's tiles. `padGutter` shifts the text past the
  // connector gutter that sits LEFT of right-half columns.
  const renderHeader = (stage: WcStage, matches: WcMatch[], padGutter = false) => (
    <div
      onMouseEnter={() => !filtering && setRoundHover(stage)}
      onMouseLeave={() => setRoundHover(null)}
      className={`sticky top-0 z-10 ${HEADER_H} bg-[var(--cromo-bg)] pb-2 pr-1 ${padGutter ? 'pl-11' : 'pl-1'}`}
    >
      <h3 className={`text-sm font-bold ${roundHover === stage ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg)]'}`}>
        {STAGE_LABELS[stage]}
      </h3>
      <p className="text-[11px] text-[var(--cromo-fg-subtle)]">{dateSpanET(matches)} ET</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ─── Toolbar: team filter + (mobile) expand/collapse all ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <TeamCombobox teams={teams} value={focus} onChange={setFilter} teamName={teamName} t={t} />
        {filtering && (
          <button
            type="button"
            onClick={() => setFilter('')}
            className="rounded-lg border border-[var(--cromo-border)] px-2.5 py-2 text-xs font-medium text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-fg)]"
          >
            ✕ {t('clearFilter')}
          </button>
        )}
        {!filtering && allStages.length > 0 && (
          <div className="ml-auto flex gap-1 lg:hidden">
            <button
              type="button"
              onClick={() => setCollapsed(new Set())}
              className="rounded-lg border border-[var(--cromo-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-fg)]"
            >
              {t('expandAll')}
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(new Set(allStages))}
              className="rounded-lg border border-[var(--cromo-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-fg)]"
            >
              {t('collapseAll')}
            </button>
          </div>
        )}
      </div>
      {filtering && (
        <p className="-mt-3 text-xs text-[var(--cromo-fg-subtle)]">
          {t('filterHint', { team: teamName(focus, teams.find((tm) => tm.code === focus)?.name) })}
        </p>
      )}

      {/* ─── Mobile / tablet: stacked, collapsible round list ───
          The connector-tree below is ~1600px wide and leans on hover for the
          path highlight — neither works on a phone. Under `lg` we instead stack
          each round vertically as full-width match cards: no horizontal scroll,
          and the "could face" popover (tap-to-focus) isn't trapped in an
          overflow-clipped scroller. Each round collapses independently so a long
          bracket is navigable. */}
      <div className="space-y-3 lg:hidden">
        {mobileSections.length === 0 ? (
          <p className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 text-sm text-[var(--cromo-fg-muted)]">
            {t('noBracketForTeam')}
          </p>
        ) : (
          mobileSections.map((round) => {
            // While filtering we force every shown round open; the filtered list
            // is short and hiding matches behind a collapsed header would defeat
            // the filter.
            const isOpen = filtering || !collapsed.has(round.stage);
            return (
              <section key={round.stage} className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
                <button
                  type="button"
                  onClick={() => !filtering && toggleStage(round.stage)}
                  aria-expanded={isOpen}
                  disabled={filtering}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left"
                >
                  {!filtering && (
                    <span
                      aria-hidden
                      className={`text-xs text-[var(--cromo-fg-subtle)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    >
                      ▶
                    </span>
                  )}
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-[var(--cromo-fg)]">{STAGE_LABELS[round.stage]}</span>
                    <span className="block text-[11px] text-[var(--cromo-fg-subtle)]">{dateSpanET(round.matches)} ET</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--cromo-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--cromo-fg-muted)]">
                    {round.matches.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-[var(--cromo-border)] p-3">
                    {round.matches.map((m) => {
                      const inv = involveOf(m);
                      return (
                        <MatchCard
                          key={m.id}
                          match={m}
                          groups={overview.groups}
                          bracket={overview.bracket}
                          highlight={inv === 'definite'}
                          possible={inv === 'possible'}
                          onSelectTeam={onSelectTeam}
                          t={t}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* ─── Desktop: the connector-joined bracket tree ───
          The canvas is ~2,600px wide, so the panel keeps the HORIZONTAL scroll
          (`overflow-x-auto`) but drops the vertical one: with no height cap it
          grows to its full height and the page's own scroll handles the tall
          canvas — no nested vertical scrollbar. The round headings keep
          `sticky top-0`; it's inert vertically now (the horizontal scroller has
          no vertical overflow to pin against), so they scroll away with the
          page, but the class is harmless and degrades gracefully. */}
      {filteredEmpty ? (
        <p className="hidden rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 text-sm text-[var(--cromo-fg-muted)] lg:block">
          {t('noBracketForTeam')}
        </p>
      ) : canMirror && finalMatch ? (
      /* Two-sided wallchart: the first half of each (tree-ordered) round runs
         left→centre, the second half right→centre, meeting at the FINAL. Tile
         slot keys stay GLOBAL tree indices so the hover path works unchanged
         across both halves. */
      <div ref={scrollBoxRef} className="hidden overflow-x-auto pb-3 lg:block">
        <div className="flex min-w-max items-stretch">
          {preRounds.map((round, ri) => {
            const half = round.matches.length / 2;
            const leftMatches = round.matches.slice(0, half);
            const isInnermost = ri === preRounds.length - 1;
            return (
              <div key={`L-${round.stage}`} className="flex flex-col">
                {renderHeader(round.stage, round.matches)}
                <div className="flex flex-1">
                  <div className={`${COLUMN_W} flex flex-col`}>
                    {leftMatches.map((m, si) => renderTile(m, ri, si))}
                  </div>
                  {isInnermost ? (
                    <FinalStub active={active} on={!filtering && path.tiles.has(`${ri}:0`)} />
                  ) : (
                    <ConnectorGutter
                      count={half}
                      roundIdx={ri}
                      active={active}
                      pathConnectors={filtering ? EMPTY_CONNECTORS : path.connectors}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {(() => {
            const inv = involveOf(finalMatch);
            const onPath = path.tiles.has(`${finalRoundIdx}:0`);
            const finalOn = roundHover === 'FINAL';
            const thirdMatch = third[0];
            const thirdInv = thirdMatch ? involveOf(thirdMatch) : 'none';
            return (
              <div className="flex flex-col">
                {renderHeader('FINAL', rounds[finalRoundIdx]!.matches)}
                <div className={`${COLUMN_W} flex flex-1 flex-col justify-center gap-8 px-1.5`}>
                  <MatchCard
                    match={finalMatch}
                    groups={overview.groups}
                    bracket={overview.bracket}
                    dim={filtering ? inv === 'none' : active && !onPath && !finalOn}
                    highlight={filtering ? inv === 'definite' : onPath || finalOn}
                    possible={filtering && inv === 'possible'}
                    onSelectTeam={onSelectTeam}
                    onHover={() => !filtering && setHover({ round: finalRoundIdx, slot: 0 })}
                    onHoverEnd={() => !filtering && setHover(null)}
                    t={t}
                  />
                  {thirdMatch && (!filtering || thirdInv !== 'none') && (
                    <div
                      onMouseEnter={() => !filtering && setRoundHover('THIRD')}
                      onMouseLeave={() => setRoundHover(null)}
                    >
                      <h3
                        className={`mb-2 text-sm font-bold ${
                          roundHover === 'THIRD' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg)]'
                        }`}
                      >
                        {STAGE_LABELS.THIRD}
                      </h3>
                      <MatchCard
                        match={thirdMatch}
                        groups={overview.groups}
                        bracket={overview.bracket}
                        dim={filtering ? thirdInv === 'none' : active && roundHover !== 'THIRD'}
                        highlight={filtering ? thirdInv === 'definite' : roundHover === 'THIRD'}
                        possible={filtering && thirdInv === 'possible'}
                        onSelectTeam={onSelectTeam}
                        t={t}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {preRounds.map((round, ri) => ({ round, ri })).reverse().map(({ round, ri }) => {
            const half = round.matches.length / 2;
            const rightMatches = round.matches.slice(half);
            const isInnermost = ri === preRounds.length - 1;
            return (
              <div key={`R-${round.stage}`} className="flex flex-col">
                {renderHeader(round.stage, round.matches, true)}
                <div className="flex flex-1">
                  {isInnermost ? (
                    <FinalStub active={active} on={!filtering && path.tiles.has(`${ri}:1`)} />
                  ) : (
                    <ConnectorGutter
                      count={half}
                      roundIdx={ri}
                      pairOffset={rounds[ri + 1]!.matches.length / 2}
                      mirror
                      active={active}
                      pathConnectors={filtering ? EMPTY_CONNECTORS : path.connectors}
                    />
                  )}
                  <div className={`${COLUMN_W} flex flex-col`}>
                    {rightMatches.map((m, si) => renderTile(m, ri, half + si))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      ) : (
      <div ref={scrollBoxRef} className="hidden overflow-x-auto pb-3 lg:block">
        <div className="flex min-w-max items-stretch">
          {rounds.map((round, ri) => (
            <div key={round.stage} className="flex flex-col">
              {renderHeader(round.stage, round.matches)}
              <div className="flex flex-1">
                <div className={`${COLUMN_W} flex flex-col`}>
                  {round.matches.map((m, si) => renderTile(m, ri, si))}
                </div>
                {ri < rounds.length - 1 && (
                  <ConnectorGutter
                    count={round.matches.length}
                    roundIdx={ri}
                    active={active}
                    pathConnectors={filtering ? EMPTY_CONNECTORS : path.connectors}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {third.length > 0 && !canMirror && !filteredEmpty && (!filtering || involveOf(third[0]) !== 'none') && (
        <div className="hidden max-w-sm lg:block">
          <h3 className="mb-2 text-sm font-bold text-[var(--cromo-fg)]">{STAGE_LABELS.THIRD}</h3>
          <MatchCard
            match={third[0]}
            groups={overview.groups}
            bracket={overview.bracket}
            dim={filtering && involveOf(third[0]) === 'none'}
            highlight={filtering && involveOf(third[0]) === 'definite'}
            possible={filtering && involveOf(third[0]) === 'possible'}
            onSelectTeam={onSelectTeam}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

const EMPTY_CONNECTORS = new Set<string>();

// Searchable single-select for the team filter — a native <select> over 48
// nations is a slog to scan, so this is a type-to-filter combobox (same idiom
// as CityAutocomplete): arrow/enter/escape keys, click-outside to close,
// flags + codes in the list. Empty value = "All teams".
function TeamCombobox({
  teams,
  value,
  onChange,
  teamName,
  t,
}: {
  teams: { code: string; name: string }[];
  value: string;
  onChange: (code: string) => void;
  teamName: (code: string, fallback?: string | null) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? teams.filter(
            (tm) =>
              teamName(tm.code, tm.name).toLowerCase().includes(q) ||
              tm.name.toLowerCase().includes(q) ||
              tm.code.toLowerCase().includes(q),
          )
        : teams,
    [teams, q, teamName],
  );

  useEffect(() => setActiveIndex(0), [q]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    (listRef.current.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((p) => Math.min(filtered.length - 1, p + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((p) => Math.max(0, p - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const tm = filtered[activeIndex];
      if (tm) pick(tm.code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const fieldCls =
    'flex w-full items-center gap-2 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-bg)] px-3 py-2 text-sm text-[var(--cromo-fg)] focus:border-[var(--cromo-accent)] focus:outline-none';

  return (
    <div ref={containerRef} className="relative w-60 max-w-full">
      {open ? (
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('searchTeams')}
          aria-label={t('bracketFilter')}
          autoComplete="off"
          className={fieldCls}
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={t('bracketFilter')} className={fieldCls}>
          {value ? (
            <>
              <Flag code={value} />
              <span className="min-w-0 flex-1 truncate text-left">{teamName(value)}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-[var(--cromo-fg-muted)]">{t('filterTeamAll')}</span>
          )}
          <span aria-hidden className="text-[10px] text-[var(--cromo-fg-subtle)]">▾</span>
        </button>
      )}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--cromo-fg-muted)]">{t('noTeamsMatch')}</li>
          ) : (
            filtered.map((tm, i) => (
              <li key={tm.code}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(tm.code);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === activeIndex ? 'bg-[var(--cromo-accent-soft)]' : ''
                  } ${tm.code === value ? 'font-semibold' : ''}`}
                >
                  <Flag code={tm.code} />
                  <span className="font-mono text-[10px] font-semibold text-[var(--cromo-fg-muted)]">{tm.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--cromo-fg)]">{teamName(tm.code, tm.name)}</span>
                  {tm.code === value && (
                    <span aria-hidden className="text-[var(--cromo-accent)]">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function ConnectorGutter({
  count,
  roundIdx,
  active,
  pathConnectors,
  pairOffset = 0,
  mirror = false,
}: {
  count: number;
  roundIdx: number;
  active: boolean;
  pathConnectors: Set<string>;
  /** Added to the pair index when building the path key — right-half columns
   *  in the two-sided layout feed parents in the second half of the next
   *  round, so their GLOBAL parent slots start past the midpoint. */
  pairOffset?: number;
  /** Flip the vertical bar to the right edge for right-half gutters, where
   *  the child column sits on the right and the parent toward the centre. */
  mirror?: boolean;
}) {
  const pairs = Math.floor(count / 2);
  return (
    <div className={`${GUTTER_W} relative`} aria-hidden>
      {Array.from({ length: pairs }, (_, i) => {
        const topV = ((2 * i + 0.5) / count) * 100;
        const heightV = (1 / count) * 100;
        const topH = ((2 * i + 1) / count) * 100;
        const on = pathConnectors.has(`${roundIdx}:${i + pairOffset}`);
        const color = on ? 'var(--cromo-accent)' : 'var(--cromo-border)';
        const opacity = active && !on ? 0.3 : 1;
        const side = mirror ? { right: 0 } : { left: 0 };
        return (
          <Fragment key={i}>
            <span className="absolute" style={{ ...side, top: `${topV}%`, height: `${heightV}%`, width: on ? 3 : 2, background: color, opacity }} />
            <span className="absolute" style={{ left: 0, top: `${topH}%`, width: '100%', height: on ? 3 : 2, background: color, opacity }} />
          </Fragment>
        );
      })}
    </div>
  );
}

// The single horizontal link between a semifinal column and the FINAL in the
// two-sided layout — half a connector pair, one per side of the centre column.
function FinalStub({ active, on }: { active: boolean; on: boolean }) {
  const color = on ? 'var(--cromo-accent)' : 'var(--cromo-border)';
  const opacity = active && !on ? 0.3 : 1;
  return (
    <div className={`${GUTTER_W} relative`} aria-hidden>
      <span className="absolute" style={{ left: 0, top: '50%', width: '100%', height: on ? 3 : 2, background: color, opacity }} />
    </div>
  );
}

function MatchCard({
  match,
  groups,
  bracket,
  dim,
  highlight,
  possible,
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
  possible?: boolean;
  onSelectTeam: (code: string) => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const fav = match.favourite;
  const border = highlight
    ? 'border-[var(--cromo-accent)] ring-1 ring-[var(--cromo-accent)]'
    : possible
      ? 'border-[var(--cromo-accent)]/40 ring-1 ring-[var(--cromo-accent)]/30'
      : 'border-[var(--cromo-border)]';
  return (
    <article
      // Highlight the path only while pointing at the tile itself, not the gap
      // around it. Keyboard focus within the card also triggers it.
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      className={`w-full rounded-xl border bg-[var(--cromo-surface)] p-2.5 text-sm shadow-sm transition-all ${border} ${
        dim ? 'opacity-40' : 'opacity-100'
      }`}
    >
      <SideRow side={match.home} winner={match.winnerCode === match.home.code} groups={groups} bracket={bracket} onSelectTeam={onSelectTeam} t={t} />
      <div className="my-1 border-t border-dashed border-[var(--cromo-border)]" />
      <SideRow side={match.away} winner={match.winnerCode === match.away.code} groups={groups} bracket={bracket} onSelectTeam={onSelectTeam} t={t} />

      <div className="mt-1.5 space-y-0.5 border-t border-[var(--cromo-border)] pt-1.5 text-[10px] leading-tight text-[var(--cromo-fg-subtle)]">
        <p className="flex items-center gap-1.5">
          {match.status === 'FINISHED' && (
            <span className="shrink-0 rounded bg-[var(--cromo-surface-2)] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
              {t('ftBadge')}
            </span>
          )}
          {match.status === 'LIVE' && (
            <span className="shrink-0 animate-pulse rounded bg-[var(--cromo-danger)]/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--cromo-danger)]">
              {t('liveBadge')}
            </span>
          )}
          <span>{formatKickoffET(match.kickoff)}</span>
        </p>
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

  return <PlaceholderRow side={side} groups={groups} bracket={bracket} t={t} />;
}

// Unresolved bracket slot: shows the short feed label and, on hover (desktop) or
// tap (mobile), a popover listing the teams that could still fill it.
function PlaceholderRow({
  side,
  groups,
  bracket,
  t,
}: {
  side: WcMatchSide;
  groups: WcGroupStanding[];
  bracket: WcMatch[];
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const candidates = placeholderCandidates(side.feed, groups, bracket);
  // Deep rounds can have many possible teams (the final's whole half of the
  // draw); cap the popover and summarise the rest so it stays compact.
  const MAX_SHOWN = 12;
  const shown = candidates.slice(0, MAX_SHOWN);
  const extra = candidates.length - shown.length;
  const titleAttr = candidates.length ? `${t('couldFace')} ${candidates.map((c) => c.name).join(', ')}` : undefined;
  return (
    <div className="group relative flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => candidates.length && setOpen((o) => !o)}
        aria-expanded={candidates.length ? open : undefined}
        title={titleAttr}
        className="flex min-w-0 items-center gap-1 rounded text-left text-[var(--cromo-fg-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
      >
        <span className="truncate font-mono text-xs italic">{shortPlaceholder(side.feed ?? side.placeholder)}</span>
        {candidates.length > 0 && <span aria-hidden className="text-[8px] leading-none">▾</span>}
      </button>
      {candidates.length > 0 && (
        <span
          className={`pointer-events-none absolute left-0 top-full z-20 mt-1 w-max max-w-[14rem] rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-bg)] p-2 text-left shadow-lg group-hover:visible group-focus-within:visible ${
            open ? 'visible' : 'invisible'
          }`}
        >
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
