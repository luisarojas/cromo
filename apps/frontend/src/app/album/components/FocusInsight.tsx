'use client';

import { useMemo } from 'react';
import type { Sticker } from '@/lib/api';

// Surfaces the "where should I focus next?" insight by computing per-group
// completion locally from the album's catalog + the user's ownedMap. We
// deliberately favour groups that are 1-3 stickers from done — those are the
// highest-leverage targets because finishing them unlocks the dopamine of a
// completed sub-album, and they're the ones a collector would naturally
// chase at a swap.

interface Props {
  stickers: Sticker[];
  ownedMap: Map<string, unknown>;
  // Fires when the user taps a group to filter the grid to it. AlbumDetailClient
  // wires this to setFilters({ group: [name] }).
  onSelectGroup: (groupName: string) => void;
}

interface GroupStat {
  name: string;
  total: number;
  owned: number;
  missing: number;
  percentage: number;
}

const MAX_GROUPS = 3;

export default function FocusInsight({ stickers, ownedMap, onSelectGroup }: Props) {
  const top = useMemo<GroupStat[]>(() => {
    const byGroup = new Map<string, { total: number; owned: number }>();
    for (const s of stickers) {
      const key = s.groupName ?? '';
      if (!key) continue;
      let bucket = byGroup.get(key);
      if (!bucket) {
        bucket = { total: 0, owned: 0 };
        byGroup.set(key, bucket);
      }
      bucket.total += 1;
      if (ownedMap.has(s.id)) bucket.owned += 1;
    }
    const stats: GroupStat[] = [];
    for (const [name, { total, owned }] of byGroup) {
      const missing = total - owned;
      if (missing === 0) continue; // already complete — not a focus target.
      const percentage = (owned / total) * 100;
      // Scale the "is this close to done?" threshold by group size. The hard
      // cap of 5 missing misfired on big subsets like Coca-Cola (13 stickers):
      // a user at 8/13 is genuinely close but past the absolute cap. The
      // percentage gate (≥60% complete) catches them; the absolute cap (≤3
      // missing) still surfaces last-mile groups in small subsets so a 2/4
      // group doesn't drop out at 50%.
      if (missing > 3 && percentage < 60) continue;
      stats.push({ name, total, owned, missing, percentage });
    }
    // Closest to complete first; break ties by group size so larger groups
    // (more meaningful completions) bubble up.
    stats.sort((a, b) => a.missing - b.missing || b.total - a.total);
    return stats.slice(0, MAX_GROUPS);
  }, [stickers, ownedMap]);

  if (top.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent-soft)]/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>🎯</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--cromo-accent)]">
          Focus on these
        </h3>
      </div>
      <ul className="flex flex-wrap gap-2">
        {top.map((g) => (
          <li key={g.name}>
            <button
              type="button"
              onClick={() => onSelectGroup(g.name)}
              className="flex items-center gap-2 rounded-full border border-[var(--cromo-accent)]/30 bg-[var(--cromo-surface)] hover:bg-[var(--cromo-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg)] transition-colors"
            >
              <span className="font-semibold text-[var(--cromo-accent)]">{g.name}</span>
              <span className="text-[var(--cromo-fg-muted)]">
                {g.missing} away
              </span>
              <span className="font-mono text-[10px] text-[var(--cromo-fg-subtle)]">
                {g.owned}/{g.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-[var(--cromo-fg-muted)]">
        Tap a group to filter the grid to its missing stickers.
      </p>
    </div>
  );
}
