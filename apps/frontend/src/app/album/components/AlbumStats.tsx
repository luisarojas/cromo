'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Sticker } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { VARIANT_META } from './variantMeta';
import type { OwnedVariantEntry } from './VariantPopover';

type OwnedMap = Map<string, Map<string, OwnedVariantEntry>>;

interface Props {
  stickers: Sticker[];
  ownedMap: OwnedMap;
}

const STICKERS_PER_PACK = 7;

// Rarity ladder. Anything not in this list is appended at the end. The order
// drives the bar chart so the user reads their collection from Common → rare,
// which tells a "how far up the ladder am I" story.
const TIER_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Ultra Rare',
  'Masterpiece',
  'Exclusive',
  'Base Extra',
  'Swiss Edition',
  'iCollect',
  'iCollect Rare',
  'iCollect Very Rare',
  'iCollect Ultra Rare',
  'iCollect Masterpiece',
];

const RARITY_TIER_COLORS: Record<string, string> = {
  Common: '#94a3b8',
  Uncommon: '#3b82f6',
  Rare: '#ef4444',
  'Very Rare': '#a855f7',
  'Ultra Rare': '#22c55e',
  Masterpiece: '#111827',
  Exclusive: '#f97316',
  iCollect: '#facc15',
  'iCollect Rare': '#fb7185',
  'iCollect Very Rare': '#c084fc',
  'iCollect Ultra Rare': '#86efac',
  'iCollect Masterpiece': '#475569',
  'Base Extra': '#d8b4fe',
  'Swiss Edition': '#10b981',
};

const tierIndex = (name: string) => {
  const i = TIER_ORDER.indexOf(name);
  return i === -1 ? TIER_ORDER.length : i;
};

interface CountryRow {
  teamName: string;
  fifaCode: string | null;
  owned: number;
  total: number;
}

interface GroupRow {
  group: string;
  owned: number;
  total: number;
  pct: number;
}

interface RarityRow {
  name: string;
  value: number;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--cromo-surface)',
  border: '1px solid var(--cromo-border)',
  borderRadius: '6px',
  fontSize: '12px',
  padding: '6px 10px',
};

export default function AlbumStats({ stickers, ownedMap }: Props) {
  // Coca-Cola stickers come from peeling Coke bottle labels, not packs, so
  // they're excluded from the pack-count estimate.
  const packCopies = useMemo(() => {
    const cocaStickerIds = new Set<string>();
    for (const s of stickers) {
      if (s.stickerType === 'coca_cola_special') cocaStickerIds.add(s.id);
    }
    let total = 0;
    for (const [stickerId, perSticker] of ownedMap.entries()) {
      if (cocaStickerIds.has(stickerId)) continue;
      for (const entry of perSticker.values()) total += entry.quantity;
    }
    return total;
  }, [stickers, ownedMap]);
  const packsOpened = Math.floor(packCopies / STICKERS_PER_PACK);

  const byCountry = useMemo<CountryRow[]>(() => {
    const map = new Map<string, CountryRow>();
    for (const s of stickers) {
      if (!s.teamName) continue;
      const key = s.teamName;
      let entry = map.get(key);
      if (!entry) {
        entry = { teamName: s.teamName, fifaCode: s.fifaCode, owned: 0, total: 0 };
        map.set(key, entry);
      }
      entry.total++;
      if (ownedMap.has(s.id)) entry.owned++;
    }
    return Array.from(map.values()).sort((a, b) => {
      const aPct = a.total > 0 ? a.owned / a.total : 0;
      const bPct = b.total > 0 ? b.owned / b.total : 0;
      if (aPct !== bPct) return bPct - aPct;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [stickers, ownedMap]);

  const byGroup = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    for (const s of stickers) {
      if (!s.groupName) continue;
      const key = s.groupName;
      let entry = map.get(key);
      if (!entry) {
        entry = { group: s.groupName, owned: 0, total: 0, pct: 0 };
        map.set(key, entry);
      }
      entry.total++;
      if (ownedMap.has(s.id)) entry.owned++;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, pct: g.total > 0 ? Math.round((g.owned / g.total) * 100) : 0 }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [stickers, ownedMap]);

  const rarityDist = useMemo<RarityRow[]>(() => {
    const map = new Map<string, number>();
    for (const perSticker of ownedMap.values()) {
      for (const [variantType, entry] of perSticker.entries()) {
        const tier = VARIANT_META[variantType]?.rarity ?? 'Unknown';
        map.set(tier, (map.get(tier) ?? 0) + entry.quantity);
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => tierIndex(a.name) - tierIndex(b.name));
  }, [ownedMap]);

  return (
    <div className="flex flex-col gap-5">
      {/* ─── Packs opened — a single scalar reads best as a big number ─── */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-gradient-to-br from-[var(--cromo-accent-soft)] to-[var(--cromo-surface)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
              Packs Opened
            </h3>
            <p className="mt-1 text-xs text-[var(--cromo-fg-subtle)]">
              Estimate · {packCopies.toLocaleString()} pack sticker{packCopies === 1 ? '' : 's'} owned ÷ {STICKERS_PER_PACK} per pack
            </p>
          </div>
          <div className="text-5xl font-extrabold text-[var(--cromo-accent)] leading-none tabular-nums">
            {packsOpened.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ─── Groups — radar reads a fixed 12-axis profile at a glance ─── */}
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
          <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide mb-4">
            Completion by FIFA Group
          </h3>
          {byGroup.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
              No grouped stickers in this album.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={byGroup} outerRadius="80%">
                  <PolarGrid stroke="var(--cromo-border)" />
                  <PolarAngleAxis
                    dataKey="group"
                    tickFormatter={(g) => `${g}`}
                    tick={{ fontSize: 11, fill: 'var(--cromo-fg-muted)' }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tickCount={5}
                    tick={{ fontSize: 9, fill: 'var(--cromo-fg-subtle)' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Radar
                    name="Completion"
                    dataKey="pct"
                    stroke="var(--cromo-accent)"
                    fill="var(--cromo-accent)"
                    fillOpacity={0.4}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(_v: number, _n: string, item) => {
                      const row = item.payload as GroupRow;
                      return [`${row.owned}/${row.total} (${row.pct}%)`, `Group ${row.group}`];
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ─── Rarity — ordinal bar chart along the rarity ladder ─── */}
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
          <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide mb-4">
            Variant Rarity Ladder
          </h3>
          {rarityDist.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-12">
              Add some stickers to see your rarity breakdown.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rarityDist} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
                  <CartesianGrid stroke="var(--cromo-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                    tick={{ fontSize: 10, fill: 'var(--cromo-fg-muted)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--cromo-fg-muted)' }}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => [`${value} copies`, 'Owned']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {rarityDist.map((entry) => (
                      <Cell key={entry.name} fill={RARITY_TIER_COLORS[entry.name] ?? '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ─── Country — sorted horizontal bar chart, 48 teams stacked ─── */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
            Completion by Country
          </h3>
          <span className="text-[10px] text-[var(--cromo-fg-subtle)]">
            {byCountry.length} {byCountry.length === 1 ? 'team' : 'teams'} · sorted by completion
          </span>
        </div>
        {byCountry.length === 0 ? (
          <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
            No team stickers in this album.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {byCountry.map((c) => {
              const pct = c.total > 0 ? Math.round((c.owned / c.total) * 100) : 0;
              return (
                <div key={c.teamName} className="flex items-center gap-2.5">
                  {c.fifaCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={flagUrl(c.fifaCode) ?? undefined}
                      alt={c.fifaCode}
                      width={20}
                      height={14}
                      className="rounded-[2px] object-cover flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="w-5 shrink-0" aria-hidden />
                  )}
                  <span className="w-10 text-[10px] font-mono font-semibold text-[var(--cromo-fg-muted)] shrink-0 tabular-nums">
                    {c.fifaCode ?? ''}
                  </span>
                  <span className="w-32 text-sm text-[var(--cromo-fg)] truncate shrink-0">
                    {c.teamName}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--cromo-surface-2)] overflow-hidden">
                    <div
                      className={`h-full transition-all ${pct === 100 ? 'bg-[var(--cromo-success)]' : 'bg-[var(--cromo-accent)]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums w-24 text-right text-[var(--cromo-fg-muted)] shrink-0">
                    {c.owned}/{c.total} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
