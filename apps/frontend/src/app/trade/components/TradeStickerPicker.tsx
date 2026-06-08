'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { fetchStickersBulk, type StickerVariant, type CollectionItem } from '@/lib/api';
import { variantLabel, variantSwatch, isBaseVariant, compareVariantTypes } from '@/app/album/components/variantMeta';
import { flagUrl } from '@/lib/flags';
import { foldAccents } from '@/lib/normalize';
import { HeartIcon } from '@/components/HeartIcon';
import CashInput from './CashInput';
import PickerToolbar, { type SortKey } from './PickerToolbar';

export interface TradePickerItem {
  variantId: string;
  direction: 'offer' | 'want';
  quantity: number;
}

interface SelectedOffer {
  variantId: string;
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  variantType: string;
  maxQty: number;
  quantity: number;
}

interface WantItem {
  key: string;
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  allVariants: StickerVariant[];
  variantId: string;
  variantType: string;
  loading: boolean;
  error: string | null;
  fromSuggestion: boolean;
  selected: boolean;
  quantity: number;
}

interface Props {
  offerItems: CollectionItem[];
  offerItemsLoading: boolean;
  suggestedOfferCodes: string[];
  suggestedWantCodes: string[];
  suggestedWantVariantIds?: string[];
  token: string;
  partnerName?: string;
  favouriteCodes?: Set<string>;
  onChange: (items: TradePickerItem[], offerCash: number, wantCash: number) => void;
  onHideSticker?: (variantId: string) => void;
  onUnhideSticker?: (variantId: string) => void;
  initialOfferVariants?: { variantId: string; quantity: number }[];
  initialWantVariants?: { variantId: string; quantity: number }[];
  initialOfferCash?: number;
  initialWantCash?: number;
}

let keySeq = 0;
function nextKey() {
  return String(++keySeq);
}

function parseCashCents(value: string): number {
  const num = parseFloat(value);
  if (!isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

type Side = 'offer' | 'want';

export default function TradeStickerPicker({
  offerItems,
  offerItemsLoading,
  suggestedOfferCodes,
  suggestedWantCodes,
  suggestedWantVariantIds = [],
  token,
  favouriteCodes = new Set(),
  onChange,
  onHideSticker,
  onUnhideSticker,
  initialOfferVariants,
  initialWantVariants,
  initialOfferCash,
  initialWantCash,
}: Props) {
  const [selectedOffers, setSelectedOffers] = useState<SelectedOffer[]>([]);
  const [wantItems, setWantItems] = useState<WantItem[]>([]);

  // Per-side toolbar state
  const [offerSearch, setOfferSearch] = useState('');
  const [offerSort, setOfferSort] = useState<SortKey>('code');
  const [offerVariantFilters, setOfferVariantFilters] = useState<string[]>([]);
  const [offerCountryFilters, setOfferCountryFilters] = useState<string[]>([]);
  const [offerGroupFilters, setOfferGroupFilters] = useState<string[]>([]);
  const [offerQtyFilter, setOfferQtyFilter] = useState<'' | 'duplicate' | 'single'>('');
  const [offerTheyNeedOnly, setOfferTheyNeedOnly] = useState(false);
  const [offerShowHidden, setOfferShowHidden] = useState(false);

  const [wantSearch, setWantSearch] = useState('');
  const [wantSort, setWantSort] = useState<SortKey>('code');
  const [wantVariantFilters, setWantVariantFilters] = useState<string[]>([]);
  const [wantCountryFilters, setWantCountryFilters] = useState<string[]>([]);
  const [wantGroupFilters, setWantGroupFilters] = useState<string[]>([]);
  const [wantMissingOnly, setWantMissingOnly] = useState(false);
  const [wantFavouritedOnly, setWantFavouritedOnly] = useState(false);

  const [offerCashInput, setOfferCashInput] = useState(
    () => (initialOfferCash && initialOfferCash > 0 ? (initialOfferCash / 100).toFixed(2) : ''),
  );
  const [wantCashInput, setWantCashInput] = useState(
    () => (initialWantCash && initialWantCash > 0 ? (initialWantCash / 100).toFixed(2) : ''),
  );

  // Mobile-only segmented tab. On md+ both panels render side-by-side and
  // this is ignored.
  const [mobileSide, setMobileSide] = useState<Side>('offer');

  const wantInitRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialOfferVariantsMemo = useMemo(() => initialOfferVariants, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialWantVariantsMemo = useMemo(() => initialWantVariants, []); // eslint-disable-line react-hooks/exhaustive-deps

  const offerDraftApplied = useRef(false);
  useEffect(() => {
    if (offerDraftApplied.current || !initialOfferVariantsMemo?.length || offerItemsLoading || offerItems.length === 0) return;
    offerDraftApplied.current = true;
    const draftMap = new Map(initialOfferVariantsMemo.map((d) => [d.variantId, d.quantity]));
    const restored: SelectedOffer[] = [];
    for (const item of offerItems) {
      const qty = draftMap.get(item.stickerVariantId);
      if (qty === undefined) continue;
      restored.push({
        variantId: item.stickerVariantId,
        albumCode: item.albumCode,
        playerName: item.playerName,
        teamName: item.teamName,
        fifaCode: item.fifaCode,
        groupName: item.groupName,
        variantType: item.variantType,
        maxQty: item.quantity,
        quantity: Math.min(qty, item.quantity),
      });
    }
    if (restored.length > 0) setSelectedOffers(restored);
  }, [offerItems, offerItemsLoading, initialOfferVariantsMemo]);

  const wantDraftApplied = useRef(false);
  useEffect(() => {
    if (wantDraftApplied.current || !initialWantVariantsMemo?.length) return;
    if (wantItems.length === 0 || wantItems.some((w) => w.loading)) return;
    wantDraftApplied.current = true;
    const draftQtyByVariantId = new Map(
      initialWantVariantsMemo.map((d) => [d.variantId, d.quantity]),
    );
    setWantItems((prev) =>
      prev.map((w) => {
        const qty = draftQtyByVariantId.get(w.variantId);
        if (qty === undefined) return w;
        return { ...w, selected: true, quantity: Math.max(1, Math.min(99, qty)) };
      }),
    );
  }, [wantItems, initialWantVariantsMemo]);

  useEffect(() => {
    const items: TradePickerItem[] = [
      ...selectedOffers.map((o) => ({
        variantId: o.variantId,
        direction: 'offer' as const,
        quantity: o.quantity,
      })),
      ...wantItems
        .filter((w) => w.selected && !w.loading && !w.error && w.variantId)
        .map((w) => ({ variantId: w.variantId, direction: 'want' as const, quantity: w.quantity })),
    ];
    const offerCents = parseCashCents(offerCashInput);
    const wantCents = parseCashCents(wantCashInput);
    onChangeRef.current(items, offerCents, wantCents);
  }, [selectedOffers, wantItems, offerCashInput, wantCashInput]);

  useEffect(() => {
    if (wantInitRef.current || suggestedWantCodes.length === 0) return;
    wantInitRef.current = true;

    const entries: WantItem[] = suggestedWantCodes.map((code) => ({
      key: nextKey(),
      albumCode: code,
      playerName: null,
      teamName: null,
      fifaCode: null,
      groupName: null,
      allVariants: [],
      variantId: '',
      variantType: 'base_border',
      loading: true,
      error: null,
      fromSuggestion: true,
      selected: false,
      quantity: 1,
    }));

    setWantItems(entries);

    const partnerVariantIdSet = new Set(suggestedWantVariantIds);

    fetchStickersBulk(suggestedWantCodes, token)
      .then((results) => {
        const byCode = new Map(results.map((r) => [r.albumCode, r]));
        setWantItems((prev) => {
          // Expand each placeholder (one per album code) into one row per
          // variant the partner actually has, so the user can request, e.g.,
          // both BRA1 Blue AND BRA1 Red in the same trade. With one row per
          // variant, `allVariants` collapses to a single-entry array, which
          // suppresses the now-redundant variant dropdown on the summary chip.
          const next: WantItem[] = [];
          for (const w of prev) {
            const result = byCode.get(w.albumCode);
            if (!result) {
              next.push({ ...w, loading: false, error: 'Not found' });
              continue;
            }
            const filteredVariants = partnerVariantIdSet.size > 0
              ? result.variants.filter((v) => partnerVariantIdSet.has(v.id))
              : [];
            const baseVariant = result.variants.find((v) => isBaseVariant(v.variantType)) ?? result.variants[0];
            const variantsToOffer = filteredVariants.length > 0
              ? filteredVariants
              : baseVariant
                ? [baseVariant]
                : result.variants;
            for (const v of variantsToOffer) {
              next.push({
                ...w,
                key: nextKey(),
                playerName: result.playerName,
                teamName: result.teamName,
                fifaCode: result.fifaCode,
                groupName: result.groupName,
                allVariants: [v],
                variantId: v.id,
                variantType: v.variantType,
                loading: false,
                error: null,
              });
            }
          }
          return next;
        });
      })
      .catch(() => {
        setWantItems((prev) =>
          prev.map((w) => (w.loading ? { ...w, loading: false, error: 'Failed to load' } : w)),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Offer handlers ────────────────────────────────────────────────────────

  function toggleOffer(item: CollectionItem) {
    const isSelected = selectedOffers.some((o) => o.variantId === item.stickerVariantId);
    if (isSelected) {
      setSelectedOffers((prev) => prev.filter((o) => o.variantId !== item.stickerVariantId));
    } else {
      setSelectedOffers((prev) => [
        ...prev,
        {
          variantId: item.stickerVariantId,
          albumCode: item.albumCode,
          playerName: item.playerName,
          teamName: item.teamName,
          fifaCode: item.fifaCode,
          groupName: item.groupName,
          variantType: item.variantType,
          maxQty: item.quantity,
          quantity: 1,
        },
      ]);
    }
  }

  function adjustOfferQty(variantId: string, delta: number) {
    setSelectedOffers((prev) =>
      prev.map((o) =>
        o.variantId === variantId
          ? { ...o, quantity: Math.max(1, Math.min(o.maxQty, o.quantity + delta)) }
          : o,
      ),
    );
  }

  // ── Want handlers ─────────────────────────────────────────────────────────

  function toggleWantSuggestion(key: string) {
    setWantItems((prev) => prev.map((w) => (w.key === key ? { ...w, selected: !w.selected } : w)));
  }

  function adjustWantQty(key: string, delta: number) {
    setWantItems((prev) =>
      prev.map((w) =>
        w.key === key ? { ...w, quantity: Math.max(1, Math.min(99, w.quantity + delta)) } : w,
      ),
    );
  }

  function clearAllOffers() {
    setSelectedOffers([]);
  }
  function clearAllWants() {
    setWantItems((prev) => prev.map((w) => ({ ...w, selected: false, quantity: 1 })));
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const suggestedSet = new Set(suggestedOfferCodes);
  const selectedVariantIds = new Set(selectedOffers.map((o) => o.variantId));
  const ownedAlbumCodes = new Set(offerItems.map((item) => item.albumCode));
  // Variant-level ownership for the want side. Album-code level would say
  // "you own BRA1" if you have BRA1 base_border — but the partner may be
  // offering BRA1 Blue, which is a different variant you don't actually
  // own. The "I need" indicator and the wantMissingOnly filter both need
  // variant-id precision now that want rows are one-per-variant.
  const ownedVariantIds = new Set(offerItems.map((item) => item.stickerVariantId));

  const offerVisibleItems = offerItems.filter((d) => !d.tradeHidden);
  const offerHiddenItems = offerItems.filter((d) => d.tradeHidden);

  const offerVariants = unique(offerVisibleItems.map((d) => d.variantType)).sort(compareVariantTypes);
  const offerCountries = unique(offerVisibleItems.map((d) => d.fifaCode ?? '').filter(Boolean)).sort();
  const offerGroups = unique(offerVisibleItems.map((d) => d.groupName ?? '').filter(Boolean)).sort();

  const filteredOfferList = offerVisibleItems
    .filter((item) => {
      if (selectedVariantIds.has(item.stickerVariantId)) return false;
      if (offerQtyFilter === 'duplicate' && item.quantity < 2) return false;
      if (offerQtyFilter === 'single' && item.quantity !== 1) return false;
      if (offerTheyNeedOnly && !suggestedSet.has(item.albumCode)) return false;
      if (offerVariantFilters.length > 0 && !offerVariantFilters.includes(item.variantType)) return false;
      if (offerCountryFilters.length > 0 && !offerCountryFilters.includes(item.fifaCode ?? '')) return false;
      if (offerGroupFilters.length > 0 && !offerGroupFilters.includes(item.groupName ?? '')) return false;
      if (!offerSearch) return true;
      const q = foldAccents(offerSearch);
      return (
        foldAccents(item.albumCode).includes(q) ||
        foldAccents(item.playerName ?? '').includes(q) ||
        foldAccents(item.teamName ?? '').includes(q) ||
        foldAccents(item.fifaCode ?? '').includes(q) ||
        foldAccents(item.groupName ?? '').includes(q)
      );
    })
    .sort((a, b) => {
      const aS = suggestedSet.has(a.albumCode) ? 0 : 1;
      const bS = suggestedSet.has(b.albumCode) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return compareBySort(offerSort, a, b);
    });

  const suggestions = wantItems.filter((w) => w.fromSuggestion);
  // Each want row carries a single variantType after the per-variant
  // expansion in the bulk-lookup effect — no need to flatMap allVariants.
  const wantVariants = unique(
    suggestions.filter((w) => !w.loading && !w.error).map((w) => w.variantType),
  ).sort(compareVariantTypes);
  const wantCountries = unique(
    suggestions.filter((w) => !w.loading && !w.error && w.fifaCode).map((w) => w.fifaCode!),
  ).sort();
  const wantGroups = unique(
    suggestions.filter((w) => !w.loading && !w.error && w.groupName).map((w) => w.groupName!),
  ).sort();

  const filteredSuggestions = suggestions
    .filter((w) => {
      if (w.selected) return false;
      if (w.loading) return true;
      if (wantMissingOnly && ownedVariantIds.has(w.variantId)) return false;
      if (wantFavouritedOnly && !favouriteCodes.has(w.albumCode)) return false;
      if (wantVariantFilters.length > 0 && !wantVariantFilters.includes(w.variantType)) return false;
      if (wantCountryFilters.length > 0 && !wantCountryFilters.includes(w.fifaCode ?? '')) return false;
      if (wantGroupFilters.length > 0 && !wantGroupFilters.includes(w.groupName ?? '')) return false;
      if (wantSearch) {
        const q = foldAccents(wantSearch);
        return (
          foldAccents(w.albumCode).includes(q) ||
          foldAccents(w.playerName ?? '').includes(q) ||
          foldAccents(w.teamName ?? '').includes(q) ||
          foldAccents(w.fifaCode ?? '').includes(q) ||
          foldAccents(w.groupName ?? '').includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => compareBySort(wantSort, a, b));

  const selectedWants = wantItems.filter((w) => w.selected);
  const selectedWantCount = wantItems.filter(
    (w) => w.selected && !w.loading && !w.error && w.variantId,
  ).length;

  // ── Render helpers ────────────────────────────────────────────────────────

  function offerPanel() {
    return (
      <Panel
        accent="accent"
        title="You're Offering"
        countLabel={`${selectedOffers.length} selected`}
        onClearAll={selectedOffers.length > 0 ? clearAllOffers : undefined}
      >
        <SegmentedQuantityFilter value={offerQtyFilter} onChange={setOfferQtyFilter} />

        <PickerToolbar
          accent="accent"
          search={offerSearch}
          onSearchChange={setOfferSearch}
          searchPlaceholder="Search code, player, team…"
          sort={offerSort}
          onSortChange={setOfferSort}
          variantOptions={offerVariants}
          variantFilters={offerVariantFilters}
          onVariantFiltersChange={setOfferVariantFilters}
          countryOptions={offerCountries}
          countryFilters={offerCountryFilters}
          onCountryFiltersChange={setOfferCountryFilters}
          groupOptions={offerGroups}
          groupFilters={offerGroupFilters}
          onGroupFiltersChange={setOfferGroupFilters}
          toggles={
            suggestedOfferCodes.length > 0
              ? [
                  {
                    key: 'they-need',
                    label: 'They need',
                    active: offerTheyNeedOnly,
                    onToggle: () => setOfferTheyNeedOnly((v) => !v),
                  },
                ]
              : []
          }
          resultCount={filteredOfferList.length}
        />

        <ScrollList>
          {offerItemsLoading ? (
            <SkeletonRows />
          ) : filteredOfferList.length === 0 ? (
            <EmptyState
              text={
                offerVisibleItems.length === 0
                  ? offerHiddenItems.length > 0
                    ? 'All your stickers in this album are hidden from trades.'
                    : 'No stickers in your collection for this album.'
                  : 'No stickers match your filters.'
              }
            />
          ) : (
            filteredOfferList.map((item) => (
              <PickerRow
                key={item.stickerVariantId}
                accent="accent"
                albumCode={item.albumCode}
                playerName={item.playerName}
                teamName={item.teamName}
                fifaCode={item.fifaCode}
                groupName={item.groupName}
                variantType={item.variantType}
                rightBadge={item.quantity === 1 ? { tone: 'warning', text: 'last copy' } : null}
                quantity={item.quantity}
                isSuggested={suggestedSet.has(item.albumCode)}
                suggestedTone="accent"
                selected={false}
                onClick={() => toggleOffer(item)}
                onHide={
                  onHideSticker
                    ? () => onHideSticker(item.stickerVariantId)
                    : undefined
                }
              />
            ))
          )}
        </ScrollList>

        {offerHiddenItems.length > 0 && (
          <HiddenSection
            count={offerHiddenItems.length}
            open={offerShowHidden}
            onToggle={() => setOfferShowHidden((v) => !v)}
          >
            {offerHiddenItems
              .slice()
              .sort((a, b) => a.albumCode.localeCompare(b.albumCode))
              .map((item) => (
                <PickerRow
                  key={item.stickerVariantId}
                  accent="accent"
                  albumCode={item.albumCode}
                  playerName={item.playerName}
                  teamName={item.teamName}
                  fifaCode={item.fifaCode}
                  groupName={item.groupName}
                  variantType={item.variantType}
                  quantity={item.quantity}
                  isSuggested={false}
                  selected={false}
                  muted
                  onClick={onUnhideSticker ? () => onUnhideSticker(item.stickerVariantId) : () => {}}
                  rightAction={
                    onUnhideSticker
                      ? {
                          label: 'Unhide',
                          onClick: () => onUnhideSticker(item.stickerVariantId),
                        }
                      : undefined
                  }
                />
              ))}
          </HiddenSection>
        )}
      </Panel>
    );
  }

  function wantPanel() {
    return (
      <Panel
        accent="success"
        title="You Want"
        countLabel={`${selectedWantCount} selected`}
        onClearAll={selectedWantCount > 0 ? clearAllWants : undefined}
      >
        {suggestions.length > 0 ? (
          <>
            <PickerToolbar
              accent="success"
              search={wantSearch}
              onSearchChange={setWantSearch}
              searchPlaceholder="Search code, player, team…"
              sort={wantSort}
              onSortChange={setWantSort}
              variantOptions={wantVariants}
              variantFilters={wantVariantFilters}
              onVariantFiltersChange={setWantVariantFilters}
              countryOptions={wantCountries}
              countryFilters={wantCountryFilters}
              onCountryFiltersChange={setWantCountryFilters}
              groupOptions={wantGroups}
              groupFilters={wantGroupFilters}
              onGroupFiltersChange={setWantGroupFilters}
              toggles={[
                {
                  key: 'i-need',
                  label: 'I need',
                  active: wantMissingOnly,
                  onToggle: () => setWantMissingOnly((v) => !v),
                },
                ...(favouriteCodes.size > 0
                  ? [
                      {
                        key: 'favourited',
                        label: 'Favourited',
                        icon: <HeartIcon filled className="w-3 h-3" />,
                        active: wantFavouritedOnly,
                        onToggle: () => setWantFavouritedOnly((v) => !v),
                      },
                    ]
                  : []),
              ]}
              resultCount={filteredSuggestions.length}
            />

            <ScrollList>
              {filteredSuggestions.map((w) => {
                const isFavourited = favouriteCodes.has(w.albumCode);
                if (w.loading) {
                  return (
                    <div
                      key={w.key}
                      className="h-14 rounded-lg bg-[var(--cromo-surface-2)]/60 animate-pulse"
                    />
                  );
                }
                if (w.error) {
                  return (
                    <div
                      key={w.key}
                      className="rounded-lg border border-[var(--cromo-danger)]/30 bg-[var(--cromo-danger-soft)] px-3 py-2 text-xs text-[var(--cromo-danger-text)]"
                    >
                      {w.albumCode}: {w.error}
                    </div>
                  );
                }
                return (
                  <PickerRow
                    key={w.key}
                    accent="success"
                    albumCode={w.albumCode}
                    playerName={w.playerName}
                    teamName={w.teamName}
                    fifaCode={w.fifaCode}
                    groupName={w.groupName}
                    variantType={w.variantType}
                    rightBadge={isFavourited ? { tone: 'warning', text: 'wishlist', icon: <HeartIcon filled className="w-2 h-2" /> } : null}
                    isSuggested={!ownedVariantIds.has(w.variantId)}
                    suggestedTone="very-rare"
                    suggestedLabel="I need"
                    selected={false}
                    onClick={() => toggleWantSuggestion(w.key)}
                  />
                );
              })}
            </ScrollList>
          </>
        ) : (
          <EmptyState text="No stickers available from this partner." />
        )}
      </Panel>
    );
  }

  // ── Final layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Mobile segmented control — visible only below md. The picker panels
          render full-width below; on md+ the segmented control is hidden and
          both panels show side-by-side. */}
      <div className="md:hidden shrink-0">
        <div className="grid grid-cols-2 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] overflow-hidden text-sm font-medium">
          <button
            onClick={() => setMobileSide('offer')}
            className={`px-3 py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
              mobileSide === 'offer'
                ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                : 'text-[var(--cromo-fg-muted)]'
            }`}
          >
            Offering
            {selectedOffers.length > 0 && (
              <span className="text-[10px] font-semibold tabular-nums bg-white/25 rounded px-1 py-px">
                {selectedOffers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileSide('want')}
            className={`px-3 py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
              mobileSide === 'want'
                ? 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]'
                : 'text-[var(--cromo-fg-muted)]'
            }`}
          >
            Wanting
            {selectedWantCount > 0 && (
              <span className="text-[10px] font-semibold tabular-nums bg-white/25 rounded px-1 py-px">
                {selectedWantCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Picker panels: stacked tabbed on mobile, side-by-side on md+. We
          render BOTH panels on md+ and use `hidden md:flex` / `md:hidden`
          tricks on mobile so we don't lose state on tab switch. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div className={`min-h-0 ${mobileSide === 'offer' ? 'flex' : 'hidden'} md:flex flex-col`}>
          {offerPanel()}
        </div>
        <div className={`min-h-0 ${mobileSide === 'want' ? 'flex' : 'hidden'} md:flex flex-col`}>
          {wantPanel()}
        </div>
      </div>

      {/* Trade Summary Bar — sticky-ish bottom region. The parent (modal or
          page) controls overall scroll; this block stays at the bottom of the
          flex column. */}
      <div className="shrink-0 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-3 flex flex-col gap-2.5">
        <SummaryRow
          label="Offering"
          accent="accent"
          itemCount={selectedOffers.length}
          cashInput={offerCashInput}
          onCashChange={setOfferCashInput}
          empty={selectedOffers.length === 0}
        >
          {selectedOffers.map((o) => (
            <SelectedChip
              key={o.variantId}
              albumCode={o.albumCode}
              playerName={o.playerName}
              fifaCode={o.fifaCode}
              variantType={o.variantType}
              accent="accent"
              suggested={suggestedSet.has(o.albumCode) ? 'they need' : null}
              quantity={o.quantity}
              minQty={1}
              maxQty={o.maxQty}
              onIncrement={() => adjustOfferQty(o.variantId, 1)}
              onDecrement={() => adjustOfferQty(o.variantId, -1)}
              onRemove={() =>
                setSelectedOffers((prev) => prev.filter((x) => x.variantId !== o.variantId))
              }
            />
          ))}
        </SummaryRow>

        <div className="h-px bg-[var(--cromo-border)]" />

        <SummaryRow
          label="Wanting"
          accent="success"
          itemCount={selectedWantCount}
          cashInput={wantCashInput}
          onCashChange={setWantCashInput}
          empty={selectedWants.length === 0}
        >
          {selectedWants.map((w) => {
            if (w.loading) {
              return (
                <div
                  key={w.key}
                  className="w-24 h-9 rounded-md bg-[var(--cromo-surface-2)] animate-pulse shrink-0"
                />
              );
            }
            if (w.error) {
              return (
                <div
                  key={w.key}
                  className="flex items-center gap-1 rounded-md border border-[var(--cromo-danger)]/20 bg-[var(--cromo-surface)] px-2 py-1 shrink-0"
                >
                  <span className="text-xs text-[var(--cromo-danger-text)]">{w.albumCode}</span>
                  <button
                    onClick={() => toggleWantSuggestion(w.key)}
                    className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] transition-colors text-base leading-none"
                    aria-label={`Remove ${w.albumCode}`}
                  >
                    ×
                  </button>
                </div>
              );
            }
            return (
              <SelectedChip
                key={w.key}
                albumCode={w.albumCode}
                playerName={w.playerName}
                fifaCode={w.fifaCode}
                variantType={w.variantType}
                accent="success"
                suggested={
                  !ownedVariantIds.has(w.variantId)
                    ? favouriteCodes.has(w.albumCode)
                      ? 'wishlist'
                      : 'I need'
                    : favouriteCodes.has(w.albumCode)
                      ? 'wishlist'
                      : null
                }
                quantity={w.quantity}
                minQty={1}
                maxQty={99}
                onIncrement={() => adjustWantQty(w.key, 1)}
                onDecrement={() => adjustWantQty(w.key, -1)}
                onRemove={() => toggleWantSuggestion(w.key)}
              />
            );
          })}
        </SummaryRow>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

interface SortablePicker {
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  variantType: string;
}

function compareBySort(sort: SortKey, a: SortablePicker, b: SortablePicker): number {
  switch (sort) {
    case 'player':
      return (a.playerName ?? 'ZZZ').localeCompare(b.playerName ?? 'ZZZ');
    case 'team':
      return (a.teamName ?? 'ZZZ').localeCompare(b.teamName ?? 'ZZZ');
    case 'country':
      return (a.fifaCode ?? 'ZZZ').localeCompare(b.fifaCode ?? 'ZZZ');
    case 'group':
      return (a.groupName ?? 'ZZZ').localeCompare(b.groupName ?? 'ZZZ');
    case 'variant':
      return compareVariantTypes(a.variantType, b.variantType);
    case 'code':
    default:
      return a.albumCode.localeCompare(b.albumCode, undefined, { numeric: true });
  }
}

// ── Building blocks ────────────────────────────────────────────────────────

function Panel({
  accent,
  title,
  countLabel,
  onClearAll,
  children,
}: {
  accent: 'accent' | 'success';
  title: string;
  countLabel: string;
  onClearAll?: () => void;
  children: React.ReactNode;
}) {
  const headerColor = accent === 'accent' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-success-text)]';
  const bg = accent === 'accent' ? 'bg-[var(--cromo-accent-soft)]' : 'bg-[var(--cromo-success-soft)]';
  const border = accent === 'accent' ? 'border-blue-100' : 'border-emerald-100';
  return (
    <div className={`rounded-xl border ${border} ${bg} p-3 sm:p-4 flex flex-col gap-2.5 min-h-0 flex-1`}>
      <div className="flex items-center justify-between shrink-0">
        <h3 className={`text-sm font-semibold ${headerColor}`}>{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--cromo-fg-subtle)] tabular-nums">{countLabel}</span>
          {onClearAll && (
            <button
              onClick={onClearAll}
              className="text-[10px] text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function SegmentedQuantityFilter({
  value,
  onChange,
}: {
  value: '' | 'duplicate' | 'single';
  onChange: (v: '' | 'duplicate' | 'single') => void;
}) {
  return (
    <div className="flex rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] overflow-hidden text-[11px] font-medium shrink-0">
      {(['', 'duplicate', 'single'] as const).map((v) => {
        const label = v === '' ? 'All' : v === 'duplicate' ? 'Extras' : 'Last copy';
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-1.5 transition-colors ${
              value === v
                ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScrollList({ children }: { children: React.ReactNode }) {
  // flex-1 min-h-0 lets the list shrink to fit whatever space the panel
  // has after the toolbar, so it never escapes the panel boundary on a
  // short viewport. The previous `min-h-[18rem]` floor was forcing 288px
  // even when the panel only had room for 200, which spilled the list
  // below the modal footer. The outer modal/page controls the overall
  // viewport — this scroller just owns its own slice.
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto -mx-1 px-1">
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-10 px-3">{text}</p>
  );
}

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-[var(--cromo-surface-2)]/60 animate-pulse" />
      ))}
    </>
  );
}

function HiddenSection({
  count,
  open,
  onToggle,
  children,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)]/60">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
          Hidden from trades
          <span className="tabular-nums">({count})</span>
        </span>
        <span className="text-[var(--cromo-fg-subtle)]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 max-h-56 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  accent,
  albumCode,
  playerName,
  teamName,
  fifaCode,
  groupName,
  variantType,
  quantity,
  rightBadge,
  isSuggested,
  suggestedTone = 'accent',
  suggestedLabel = 'they need',
  selected,
  muted,
  onClick,
  onHide,
  rightAction,
}: {
  accent: 'accent' | 'success';
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  variantType: string;
  quantity?: number;
  rightBadge?: { tone: 'warning' | 'success' | 'accent' | 'danger'; text: string; icon?: React.ReactNode } | null;
  isSuggested: boolean;
  suggestedTone?: 'accent' | 'very-rare' | 'success';
  suggestedLabel?: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
  onHide?: () => void;
  rightAction?: { label: string; onClick: () => void };
}) {
  const selectedBorder =
    accent === 'accent'
      ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
      : 'border-[var(--cromo-success)] bg-[var(--cromo-success-soft)]';
  const idleHover =
    accent === 'accent'
      ? 'hover:border-[var(--cromo-accent)]/40 hover:bg-[var(--cromo-accent-soft)]/40'
      : 'hover:border-[var(--cromo-success)]/40 hover:bg-[var(--cromo-success-soft)]/40';

  const suggestedToneClass = {
    accent: 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30',
    'very-rare': 'text-[var(--cromo-tier-very-rare)] bg-[var(--cromo-tier-very-rare-soft)] border-[var(--cromo-tier-very-rare)]/30',
    success: 'text-[var(--cromo-success-text)] bg-[var(--cromo-success-soft)] border-[var(--cromo-success)]/30',
  }[suggestedTone];

  const badgeToneClass = rightBadge
    ? {
        warning: 'text-[var(--cromo-warning-text)] bg-[var(--cromo-warning-soft)] border-[var(--cromo-warning)]/30',
        success: 'text-[var(--cromo-success-text)] bg-[var(--cromo-success-soft)] border-[var(--cromo-success)]/30',
        accent: 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30',
        danger: 'text-[var(--cromo-danger-text)] bg-[var(--cromo-danger-soft)] border-[var(--cromo-danger)]/30',
      }[rightBadge.tone]
    : '';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? onClick() : undefined)}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left w-full transition-colors cursor-pointer min-h-[56px] ${
        selected
          ? selectedBorder
          : muted
            ? 'border-[var(--cromo-border)] bg-[var(--cromo-surface)]/40 opacity-70'
            : `border-[var(--cromo-border)] bg-[var(--cromo-surface)] ${idleHover}`
      }`}
    >
      <span
        className={`shrink-0 w-3 h-3 rounded-full border ${variantSwatch(variantType)}`}
        title={variantLabel(variantType)}
      />

      {fifaCode && flagUrl(fifaCode) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(fifaCode)!}
          alt={fifaCode}
          className="shrink-0 w-5 h-3.5 object-cover rounded-sm border border-[var(--cromo-border)]"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
            {albumCode}
          </span>
          {playerName && (
            <span className="text-xs text-[var(--cromo-fg)] truncate">{playerName}</span>
          )}
          {isSuggested && (
            <span
              className={`shrink-0 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${suggestedToneClass}`}
            >
              {suggestedLabel}
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--cromo-fg-subtle)] truncate">
          {variantLabel(variantType)}
          {teamName ? ` · ${teamName}` : ''}
          {groupName ? ` · ${groupName}` : ''}
        </div>
      </div>

      {rightBadge && (
        <span
          className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${badgeToneClass}`}
        >
          {rightBadge.icon}
          {rightBadge.text}
        </span>
      )}

      {quantity !== undefined && !rightBadge && quantity > 1 && (
        <span className="shrink-0 text-xs text-[var(--cromo-fg-subtle)] tabular-nums">×{quantity}</span>
      )}

      {onHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          aria-label="Hide from trades"
          title="Hide from trades"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-surface-2)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
        </button>
      )}

      {rightAction && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            rightAction.onClick();
          }}
          className="shrink-0 inline-flex items-center px-2 py-1 rounded-md border border-[var(--cromo-accent)]/40 bg-[var(--cromo-surface)] text-[11px] font-medium text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)] transition-colors"
        >
          {rightAction.label}
        </button>
      )}

      {!rightAction && (
        <span
          className={`shrink-0 text-base font-medium transition-colors ${
            selected
              ? accent === 'accent'
                ? 'text-[var(--cromo-accent)]'
                : 'text-[var(--cromo-success-text)]'
              : 'text-[var(--cromo-fg-subtle)]'
          }`}
        >
          {selected ? '✓' : '+'}
        </span>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  accent,
  itemCount,
  cashInput,
  onCashChange,
  empty,
  children,
}: {
  label: string;
  accent: 'accent' | 'success';
  itemCount: number;
  cashInput: string;
  onCashChange: (v: string) => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  const color = accent === 'accent' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-success-text)]';
  const badgeBg =
    accent === 'accent' ? 'bg-[var(--cromo-accent-soft)]' : 'bg-[var(--cromo-success-soft)]';
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="flex items-center justify-between sm:w-20 sm:pt-1.5 shrink-0">
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
        {itemCount > 0 && (
          <span
            className={`sm:hidden text-[10px] font-medium ${color} ${badgeBg} px-1.5 py-0.5 rounded-full tabular-nums`}
          >
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
      {/* Mobile: horizontal scroller — chips on a single line so the bar
          stays a fixed ~3.5rem regardless of selection count, leaving the
          picker list room to breathe. Desktop: keeps the wrapping layout
          since horizontal space is abundant and seeing every chip at once
          matters more than predictable height. */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {empty ? (
          <span className="text-xs text-[var(--cromo-fg-subtle)] italic">Nothing selected yet</span>
        ) : (
          children
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1.5 sm:pt-1">
        {itemCount > 0 && (
          <span
            className={`hidden sm:inline text-xs font-medium ${color} ${badgeBg} px-2 py-0.5 rounded-full tabular-nums`}
          >
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
        <CashInput
          value={cashInput}
          onChange={onCashChange}
          accent={accent === 'accent' ? 'blue' : 'emerald'}
        />
      </div>
    </div>
  );
}

function SelectedChip({
  albumCode,
  playerName,
  fifaCode,
  variantType,
  accent,
  suggested,
  quantity,
  minQty,
  maxQty,
  onIncrement,
  onDecrement,
  onRemove,
  variantSelect,
}: {
  albumCode: string;
  playerName: string | null;
  fifaCode: string | null;
  variantType: string;
  accent: 'accent' | 'success';
  suggested: string | null;
  quantity: number;
  minQty: number;
  maxQty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  variantSelect?: {
    value: string;
    options: { id: string; type: string }[];
    onChange: (id: string) => void;
  };
}) {
  const border =
    accent === 'accent'
      ? 'border-[var(--cromo-accent)]/40'
      : 'border-[var(--cromo-success)]/40';
  const actionColor =
    accent === 'accent' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-success-text)]';
  const actionHover =
    accent === 'accent' ? 'hover:bg-[var(--cromo-accent-soft)]' : 'hover:bg-[var(--cromo-success-soft)]';

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border ${border} bg-[var(--cromo-surface)] pl-1.5 pr-1 py-1 shrink-0 max-w-full`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full border shrink-0 ${variantSwatch(variantType)}`}
        title={variantLabel(variantType)}
      />
      {fifaCode && flagUrl(fifaCode) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(fifaCode)!}
          alt={fifaCode}
          className="shrink-0 w-4 h-3 object-cover rounded-sm"
        />
      )}
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
          {albumCode}
        </span>
        {playerName && (
          <span className="text-[10px] text-[var(--cromo-fg-muted)] truncate max-w-[7rem]">
            {playerName}
          </span>
        )}
      </div>

      {variantSelect && (
        <select
          value={variantSelect.value}
          onChange={(e) => variantSelect.onChange(e.target.value)}
          aria-label={`${albumCode} variant`}
          className="rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-1 py-0.5 text-[10px] text-[var(--cromo-fg)] focus:outline-none max-w-[7rem]"
        >
          {variantSelect.options.map((v) => (
            <option key={v.id} value={v.id}>
              {variantLabel(v.type)}
            </option>
          ))}
        </select>
      )}

      {suggested && (
        <span
          className={`shrink-0 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${
            accent === 'accent'
              ? 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30'
              : 'text-[var(--cromo-tier-very-rare)] bg-[var(--cromo-tier-very-rare-soft)] border-[var(--cromo-tier-very-rare)]/30'
          }`}
        >
          {suggested}
        </span>
      )}

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onDecrement}
          disabled={quantity <= minQty}
          aria-label="Decrease quantity"
          className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold ${actionColor} ${actionHover} disabled:opacity-30 transition-colors`}
        >
          −
        </button>
        <span className="w-7 text-center text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
          ×{quantity}
        </span>
        <button
          onClick={onIncrement}
          disabled={quantity >= maxQty}
          aria-label="Increase quantity"
          className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold ${actionColor} ${actionHover} disabled:opacity-30 transition-colors`}
        >
          +
        </button>
      </div>

      <button
        onClick={onRemove}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-surface-2)] transition-colors text-base leading-none"
        aria-label={`Remove ${albumCode}`}
      >
        ×
      </button>
    </div>
  );
}
