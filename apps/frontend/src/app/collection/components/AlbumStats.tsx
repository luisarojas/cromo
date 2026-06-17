'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Sticker } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { usePreferencesStore } from '@/store/preferences';
import { VARIANT_META, variantLabel } from './variantMeta';
import type { OwnedVariantEntry } from './VariantPopover';
import type { FilterState } from './FilterBar';
import type { Tab } from '../[albumId]/useAlbumUrlState';

type OwnedMap = Map<string, Map<string, OwnedVariantEntry>>;

type JumpTo = (next: { tab?: Tab; filters?: FilterState }) => void;

interface Props {
  stickers: Sticker[];
  ownedMap: OwnedMap;
  favouriteSet: Set<string>;
  onJumpTo: JumpTo;
}

// Map a rarity tier (e.g. "Rare") to the variant tokens that belong to it
// (e.g. `["red", "extra_silver"]`). Used to translate a Rare Pulls tier-label
// click into an album filter. Built once at module load — `VARIANT_META` is
// static.
const TIER_TO_VARIANTS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [variant, meta] of Object.entries(VARIANT_META)) {
    if (!meta.rarity) continue;
    (out[meta.rarity] ??= []).push(variant);
  }
  return out;
})();

const STICKERS_PER_PACK = 7;
const COUNTRY_PREVIEW_COUNT = 10;

// Tier display order for the Rare Pulls trophy. Rarest first; "Common" is
// omitted because every base sticker is in it and the line would just say
// "(N owned)" — not a trophy. Tiers a user never owns are also hidden.
const TROPHY_TIER_ORDER = [
  'Unique',
  'iCollect Unique',
  'Ultra Rare',
  'iCollect Ultra Rare',
  'Gold Extra',
  'Very Rare',
  'iCollect Very Rare',
  'Exclusive',
  'Rare',
  'iCollect Rare',
  'Silver Extra',
  'Swiss Edition',
  'Base Extra',
  'Bronze Extra',
  'iCollect',
  'Uncommon',
];

const RARITY_TIER_COLORS: Record<string, string> = {
  Uncommon: '#3b82f6',
  Rare: '#ef4444',
  'Very Rare': '#a855f7',
  'Ultra Rare': '#22c55e',
  Unique: '#111827',
  Exclusive: '#f97316',
  'Base Extra': '#d8b4fe',
  'Bronze Extra': '#d97706',
  'Silver Extra': '#94a3b8',
  'Gold Extra': '#eab308',
  'Swiss Edition': '#10b981',
  iCollect: '#facc15',
  'iCollect Rare': '#fb7185',
  'iCollect Very Rare': '#c084fc',
  'iCollect Ultra Rare': '#86efac',
  'iCollect Unique': '#475569',
};

interface CountryRow {
  teamName: string;
  fifaCode: string | null;
  owned: number;
  total: number;
  pct: number;
}

interface TrophyEntry {
  stickerId: string;
  playerName: string;
}

interface TrophyTier {
  tier: string;
  entries: TrophyEntry[];
}

interface DuplicateRow {
  stickerId: string;
  albumCode: string;
  playerName: string | null;
  fifaCode: string | null;
  topVariantType: string;
  duplicates: number;
}

// Single-scalar progress ring for the Favourites card. Dasharray draws the
// `pct%` arc; rotate -90° puts the start at 12 o'clock.
function ProgressRing({
  pct,
  size,
  stroke,
  color,
  children,
}: {
  pct: number;
  size: number;
  stroke: number;
  color: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cromo-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

type CountrySort = 'most' | 'least';

export default function AlbumStats({ stickers, ownedMap, favouriteSet, onJumpTo }: Props) {
  const t = useTranslations('albumStats');
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [countrySort, setCountrySort] = useState<CountrySort>('most');
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);

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

  // Countries sorted by completion. Default is "most complete first" — the
  // celebratory framing — with a toggle to flip into "least complete first"
  // for the chase-driven view. Ties broken alphabetically for stability.
  const byCountry = useMemo<CountryRow[]>(() => {
    const map = new Map<string, CountryRow>();
    for (const s of stickers) {
      if (!s.teamName) continue;
      const key = s.teamName;
      let entry = map.get(key);
      if (!entry) {
        entry = { teamName: s.teamName, fifaCode: s.fifaCode, owned: 0, total: 0, pct: 0 };
        map.set(key, entry);
      }
      entry.total++;
      if (ownedMap.has(s.id)) entry.owned++;
    }
    const dir = countrySort === 'most' ? -1 : 1;
    return Array.from(map.values())
      .map((c) => ({ ...c, pct: c.total > 0 ? Math.round((c.owned / c.total) * 100) : 0 }))
      .sort((a, b) => {
        if (a.pct !== b.pct) return dir * (a.pct - b.pct);
        return a.teamName.localeCompare(b.teamName);
      });
  }, [stickers, ownedMap, countrySort]);

  const favouriteStats = useMemo(() => {
    let inAlbum = 0;
    let owned = 0;
    for (const s of stickers) {
      if (!favouriteSet.has(s.id)) continue;
      inAlbum++;
      if (ownedMap.has(s.id)) owned++;
    }
    const pct = inAlbum > 0 ? Math.round((owned / inAlbum) * 100) : 0;
    return { inAlbum, owned, missing: inAlbum - owned, pct };
  }, [stickers, ownedMap, favouriteSet]);

  // Rare Pulls — every owned (sticker, variant) above the Common tier, grouped
  // by tier and ordered rarest-first. Coverage % is meaningless on tiers with
  // thousand-deep denominators, so we list the actual pulls instead.
  const trophy = useMemo<TrophyTier[]>(() => {
    const stickerIndex = new Map<string, Sticker>();
    for (const s of stickers) stickerIndex.set(s.id, s);

    const byTier = new Map<string, TrophyEntry[]>();
    for (const [stickerId, perSticker] of ownedMap.entries()) {
      const sticker = stickerIndex.get(stickerId);
      if (!sticker) continue;
      const seenTiers = new Set<string>();
      for (const variantType of perSticker.keys()) {
        const tier = VARIANT_META[variantType]?.rarity;
        if (!tier || tier === 'Common') continue;
        if (seenTiers.has(tier)) continue;
        seenTiers.add(tier);
        let list = byTier.get(tier);
        if (!list) {
          list = [];
          byTier.set(tier, list);
        }
        list.push({
          stickerId,
          playerName: sticker.playerName ?? sticker.albumCode,
        });
      }
    }

    for (const list of byTier.values()) {
      list.sort((a, b) => a.playerName.localeCompare(b.playerName));
    }

    return TROPHY_TIER_ORDER
      .filter((t) => byTier.has(t))
      .map((tier) => ({ tier, entries: byTier.get(tier)! }));
  }, [stickers, ownedMap]);

  // Top 5 stickers the user has the most *tradeable* duplicates of. What
  // counts as a duplicate depends on the user's preference: when
  // `duplicatesCountAllVariants` is on, every copy beyond the first of the
  // same sticker (across variants) is a duplicate; when off, only extra
  // copies of the same variant count.
  const topDuplicates = useMemo<DuplicateRow[]>(() => {
    const stickerIndex = new Map<string, Sticker>();
    for (const s of stickers) stickerIndex.set(s.id, s);

    const rows: DuplicateRow[] = [];
    for (const [stickerId, perSticker] of ownedMap.entries()) {
      const sticker = stickerIndex.get(stickerId);
      if (!sticker) continue;
      let duplicates = 0;
      let topVariantType = '';
      let topVariantQuantity = 0;
      let tradeableTotal = 0;
      for (const [variantType, entry] of perSticker.entries()) {
        if (entry.tradeHidden) continue;
        tradeableTotal += entry.quantity;
        if (!duplicatesCountAllVariants) {
          duplicates += Math.max(0, entry.quantity - 1);
        }
        if (entry.quantity > topVariantQuantity) {
          topVariantQuantity = entry.quantity;
          topVariantType = variantType;
        }
      }
      if (duplicatesCountAllVariants) {
        duplicates = Math.max(0, tradeableTotal - 1);
      }
      if (duplicates <= 0) continue;
      rows.push({
        stickerId,
        albumCode: sticker.albumCode,
        playerName: sticker.playerName,
        fifaCode: sticker.fifaCode,
        topVariantType,
        duplicates,
      });
    }
    rows.sort((a, b) => {
      if (a.duplicates !== b.duplicates) return b.duplicates - a.duplicates;
      return a.albumCode.localeCompare(b.albumCode);
    });
    return rows.slice(0, 5);
  }, [stickers, ownedMap, duplicatesCountAllVariants]);

  const visibleCountries = showAllCountries
    ? byCountry
    : byCountry.slice(0, COUNTRY_PREVIEW_COUNT);
  const hasMoreCountries = byCountry.length > COUNTRY_PREVIEW_COUNT;

  return (
    // Constrained to a reading width: the album catalog wants xl:7xl, but
    // stats cards have small content and sprawl visibly at that width.
    <div className="flex flex-col gap-5 max-w-5xl mx-auto w-full">
      {/* ─── Hero row: Favourites ring (1/3) + Country list (2/3) ─── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* ─── Favourites — centered ring hero, stretches to row height ─── */}
        {favouriteStats.inAlbum === 0 ? (
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 flex flex-col lg:col-span-1">
            <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
              {t('favouritesOwned')}
            </h3>
            <p className="flex-1 flex items-center justify-center text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
              {t('noFavourites')}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onJumpTo({ tab: 'have', filters: { favouritesOnly: true } })}
            className="text-left rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 flex flex-col lg:col-span-1 hover:border-[var(--cromo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cromo-accent)] transition-colors"
          >
            <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
              {t('favouritesOwned')}
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
              <ProgressRing pct={favouriteStats.pct} size={160} stroke={14} color="var(--cromo-accent)">
                <div className="flex flex-col items-center leading-none">
                  <span className="text-4xl font-extrabold text-[var(--cromo-fg)] tabular-nums">
                    {favouriteStats.pct}%
                  </span>
                  <span className="mt-1 text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
                    {t('ownedSmall')}
                  </span>
                </div>
              </ProgressRing>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-[var(--cromo-fg)] tabular-nums">
                  {t('ownedOfFavourites', { owned: favouriteStats.owned, total: favouriteStats.inAlbum })}
                </span>
                {favouriteStats.missing > 0 && (
                  <span className="text-xs text-[var(--cromo-fg-muted)] tabular-nums">
                    {t('missingStill', { count: favouriteStats.missing })}
                  </span>
                )}
              </div>
            </div>
          </button>
        )}

        {/* ─── Countries — sortable list, defaults to most-complete first ─── */}
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
                {t('completionByCountry')}
              </h3>
              <span className="text-[10px] text-[var(--cromo-fg-subtle)]">
                {showAllCountries
                  ? t('allTeamsCount', { count: byCountry.length })
                  : t('teamsCount', { shown: visibleCountries.length, total: byCountry.length })}
              </span>
            </div>
            <div
              className="inline-flex rounded-md border border-[var(--cromo-border)] overflow-hidden text-[10px]"
              role="group"
              aria-label={t('completionByCountry')}
            >
              <button
                type="button"
                onClick={() => setCountrySort('most')}
                aria-pressed={countrySort === 'most'}
                className={`px-2 py-1 transition-colors ${
                  countrySort === 'most'
                    ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] font-semibold'
                    : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                }`}
              >
                {t('mostComplete')}
              </button>
              <button
                type="button"
                onClick={() => setCountrySort('least')}
                aria-pressed={countrySort === 'least'}
                className={`px-2 py-1 border-l border-[var(--cromo-border)] transition-colors ${
                  countrySort === 'least'
                    ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] font-semibold'
                    : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                }`}
              >
                {t('leastComplete')}
              </button>
            </div>
          </div>
          {byCountry.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
              {t('noTeamStickers')}
            </p>
          ) : (
            <>
              <div
                className={
                  showAllCountries
                    ? 'space-y-1.5 max-h-[420px] overflow-y-auto pr-1'
                    : 'space-y-1.5'
                }
              >
                {visibleCountries.map((c) => (
                  <CountryRowItem
                    key={c.teamName}
                    c={c}
                    onClick={() => onJumpTo({
                      tab: 'have',
                      // FilterBar accepts either fifaCode or teamName as the
                      // team filter value (see AlbumDetailClient filter pass).
                      filters: { team: [c.fifaCode ?? c.teamName] },
                    })}
                  />
                ))}
              </div>
              {hasMoreCountries && (
                <button
                  type="button"
                  onClick={() => setShowAllCountries((v) => !v)}
                  className="mt-3 text-xs text-[var(--cromo-accent)] hover:underline"
                >
                  {showAllCountries ? t('showLess') : t('showAllTeams', { count: byCountry.length })}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Lists row: Top Duplicates + Rare Pulls, equal width ─── */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* ─── Top tradeable duplicates ─── */}
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
              {t('topDuplicates')}
            </h3>
            <span className="text-[10px] text-[var(--cromo-fg-subtle)]">
              {t('excludesHidden')}
            </span>
          </div>
          {topDuplicates.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
              {t('noDuplicates')}
            </p>
          ) : (
            // Two-line rows with divide-y and py-2.5 to match the rhythm of
            // the Rare Pulls panel beside it, so paired-card heights agree.
            <ol className="divide-y divide-[var(--cromo-border)]">
              {topDuplicates.map((d, idx) => (
                <li key={d.stickerId} className="py-2.5 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => onJumpTo({
                      tab: 'duplicates',
                      // Album code is the catalog's most precise text identifier
                      // — search matches it via `foldAccents(albumCode)`, so this
                      // narrows the duplicates tab to the row the user clicked.
                      filters: { search: d.albumCode },
                    })}
                    className="w-full text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-[var(--cromo-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cromo-accent)] transition-colors"
                  >
                    <div className="flex items-baseline gap-2.5 mb-1">
                      <span className="w-5 text-xs font-bold text-[var(--cromo-fg-subtle)] tabular-nums shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--cromo-fg)] truncate">
                        {d.playerName ?? '—'}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-[var(--cromo-fg-muted)] shrink-0">
                        {d.duplicates}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--cromo-fg-subtle)] pl-7 leading-relaxed truncate">
                      <span className="font-mono">{d.albumCode}</span>
                      <span className="mx-1.5">·</span>
                      {variantLabel(d.topVariantType)}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ─── Rare Pulls trophy ─── */}
        <RarePulls
          trophy={trophy}
          onTierClick={(tier) => {
            const variants = TIER_TO_VARIANTS[tier];
            if (!variants || variants.length === 0) return;
            onJumpTo({ tab: 'have', filters: { variant: variants } });
          }}
        />
      </div>

      {/* ─── Packs opened — slim footer, the page's least-actionable stat ─── */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3 min-w-0">
            <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
              {t('packsOpened')}
            </h3>
            <p className="text-[10px] text-[var(--cromo-fg-subtle)]">
              {t('packsEstimate', { count: packCopies, per: STICKERS_PER_PACK })}
            </p>
          </div>
          <div className="text-2xl font-extrabold text-[var(--cromo-accent)] leading-none tabular-nums">
            {packsOpened.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function CountryRowItem({ c, onClick }: { c: CountryRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-[var(--cromo-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cromo-accent)] transition-colors"
    >
      {c.fifaCode ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(c.fifaCode) ?? undefined}
          alt={c.fifaCode}
          width={20}
          height={14}
          className="rounded-[2px] object-cover flex-shrink-0 opacity-90"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <span className="w-10 text-[10px] font-mono font-semibold text-[var(--cromo-fg-muted)] shrink-0 tabular-nums">
        {c.fifaCode ?? ''}
      </span>
      <span className="flex-1 min-w-0 text-sm text-[var(--cromo-fg)] truncate">
        {c.teamName}
      </span>
      <div className="w-24 h-1.5 rounded-full bg-[var(--cromo-surface-2)] overflow-hidden shrink-0">
        <div
          className="h-full bg-[var(--cromo-accent)] transition-all"
          style={{ width: `${c.pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums min-w-[7rem] text-right text-[var(--cromo-fg-muted)] shrink-0 whitespace-nowrap">
        {`${c.owned}/${c.total} · ${c.pct}%`}
      </span>
    </button>
  );
}

function RarePulls({ trophy, onTierClick }: { trophy: TrophyTier[]; onTierClick: (tier: string) => void }) {
  const t = useTranslations('albumStats');
  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
          {t('rarePulls')}
        </h3>
        <span className="text-[10px] text-[var(--cromo-fg-subtle)]">
          {t('rarePullsOrder')}
        </span>
      </div>
      {trophy.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-8">
          {t('noParallels')}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--cromo-border)]">
          {trophy.map(({ tier, entries }) => {
            const color = RARITY_TIER_COLORS[tier] ?? '#94a3b8';
            const displayLimit = 5;
            const shown = entries.slice(0, displayLimit);
            const hidden = entries.length - shown.length;
            return (
              <li key={tier} className="py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => onTierClick(tier)}
                  className="w-full text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-[var(--cromo-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cromo-accent)] transition-colors"
                >
                  <div className="flex items-baseline gap-2.5 mb-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 self-center"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-[var(--cromo-fg)]">{tier}</span>
                    <span className="text-xs tabular-nums text-[var(--cromo-fg-muted)] ml-auto">
                      {t('ownedCount', { count: entries.length })}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--cromo-fg-subtle)] pl-4 leading-relaxed">
                    {shown.map((e) => e.playerName).join(', ')}
                    {hidden > 0 && <span>{t('morePulls', { count: hidden })}</span>}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
