'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { fetchStickersBulk, type StickerVariant, type CollectionItem } from '@/lib/api';
import { variantLabel, variantSwatch, isBaseVariant } from '@/app/album/components/variantMeta';
import { HeartIcon } from '@/components/HeartIcon';
import CashInput from './CashInput';

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
  variantType: string;
  maxQty: number;
  quantity: number;
}

interface WantItem {
  key: string;
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  allVariants: StickerVariant[];
  variantId: string;
  variantType: string;
  loading: boolean;
  error: string | null;
  fromSuggestion: boolean;
  selected: boolean;
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
  initialOfferVariants?: { variantId: string; quantity: number }[];
  initialWantVariantIds?: string[];
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

export default function TradeStickerPicker({
  offerItems,
  offerItemsLoading,
  suggestedOfferCodes,
  suggestedWantCodes,
  suggestedWantVariantIds = [],
  token,
  partnerName,
  favouriteCodes = new Set(),
  onChange,
  onHideSticker,
  initialOfferVariants,
  initialWantVariantIds,
  initialOfferCash,
  initialWantCash,
}: Props) {
  const [selectedOffers, setSelectedOffers] = useState<SelectedOffer[]>([]);
  const [wantItems, setWantItems] = useState<WantItem[]>([]);
  const [offerSearch, setOfferSearch] = useState('');
  const [offerVariantFilters, setOfferVariantFilters] = useState<string[]>([]);
  const [offerQtyFilter, setOfferQtyFilter] = useState<'' | 'duplicate' | 'single'>('');
  const [offerTheyNeedOnly, setOfferTheyNeedOnly] = useState(false);
  const [wantVariantFilters, setWantVariantFilters] = useState<string[]>([]);
  const [wantSearch, setWantSearch] = useState('');
  const [wantMissingOnly, setWantMissingOnly] = useState(false);
  const [wantFavouritedOnly, setWantFavouritedOnly] = useState(false);
  const [offerCashInput, setOfferCashInput] = useState(
    () => (initialOfferCash && initialOfferCash > 0 ? (initialOfferCash / 100).toFixed(2) : ''),
  );
  const [wantCashInput, setWantCashInput] = useState(
    () => (initialWantCash && initialWantCash > 0 ? (initialWantCash / 100).toFixed(2) : ''),
  );

  const wantInitRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialOfferVariantsMemo = useMemo(() => initialOfferVariants, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialWantVariantIdsMemo = useMemo(() => initialWantVariantIds, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        variantType: item.variantType,
        maxQty: item.quantity,
        quantity: Math.min(qty, item.quantity),
      });
    }
    if (restored.length > 0) setSelectedOffers(restored);
  }, [offerItems, offerItemsLoading, initialOfferVariantsMemo]);

  const wantDraftApplied = useRef(false);
  useEffect(() => {
    if (wantDraftApplied.current || !initialWantVariantIdsMemo?.length) return;
    if (wantItems.length === 0 || wantItems.some((w) => w.loading)) return;
    wantDraftApplied.current = true;
    const draftIds = new Set(initialWantVariantIdsMemo);
    setWantItems((prev) =>
      prev.map((w) => {
        const matchingVariant = w.allVariants.find((v) => draftIds.has(v.id));
        if (!matchingVariant) return w;
        return { ...w, selected: true, variantId: matchingVariant.id, variantType: matchingVariant.variantType };
      }),
    );
  }, [wantItems, initialWantVariantIdsMemo]);

  useEffect(() => {
    const items: TradePickerItem[] = [
      ...selectedOffers.map((o) => ({
        variantId: o.variantId,
        direction: 'offer' as const,
        quantity: o.quantity,
      })),
      ...wantItems
        .filter((w) => w.selected && !w.loading && !w.error && w.variantId)
        .map((w) => ({ variantId: w.variantId, direction: 'want' as const, quantity: 1 })),
    ];
    const offerCents = parseCashCents(offerCashInput);
    const wantCents = parseCashCents(wantCashInput);
    onChangeRef.current(items, offerCents, wantCents);
  }, [selectedOffers, wantItems, offerCashInput, wantCashInput]);

  useEffect(() => {
    if (wantInitRef.current || suggestedWantCodes.length === 0) return;
    wantInitRef.current = true;

    const entries = suggestedWantCodes.map((code) => ({
      key: nextKey(),
      albumCode: code,
      playerName: null as string | null,
      teamName: null as string | null,
      allVariants: [] as StickerVariant[],
      variantId: '',
      variantType: 'base_border',
      loading: true,
      error: null as string | null,
      fromSuggestion: true,
      selected: false,
    }));

    setWantItems(entries);

    const partnerVariantIdSet = new Set(suggestedWantVariantIds);

    fetchStickersBulk(suggestedWantCodes, token)
      .then((results) => {
        const byCode = new Map(results.map((r) => [r.albumCode, r]));
        setWantItems((prev) =>
          prev.map((w, i) => {
            const result = byCode.get(suggestedWantCodes[i]!);
            if (!result) return { ...w, loading: false, error: 'Not found' };
            const filteredVariants = partnerVariantIdSet.size > 0
              ? result.variants.filter((v) => partnerVariantIdSet.has(v.id))
              : [];
            const baseVariant = result.variants.find((v) => isBaseVariant(v.variantType)) ?? result.variants[0];
            const variants = filteredVariants.length > 0
              ? filteredVariants
              : baseVariant
                ? [baseVariant]
                : result.variants;
            const base = variants.find((v) => isBaseVariant(v.variantType)) ?? variants[0];
            return {
              ...w,
              playerName: result.playerName,
              teamName: result.teamName,
              allVariants: variants,
              variantId: base?.id ?? '',
              variantType: base?.variantType ?? 'base_border',
              loading: false,
              error: null,
            };
          }),
        );
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

  function changeWantVariant(key: string, variant: StickerVariant) {
    setWantItems((prev) =>
      prev.map((w) =>
        w.key === key ? { ...w, variantId: variant.id, variantType: variant.variantType } : w,
      ),
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const suggestedSet = new Set(suggestedOfferCodes);
  const selectedVariantIds = new Set(selectedOffers.map((o) => o.variantId));
  const ownedAlbumCodes = new Set(offerItems.map((item) => item.albumCode));

  const offerVariants = [
    ...new Set(
      offerItems
        .filter((d) => !d.tradeHidden && !selectedVariantIds.has(d.stickerVariantId))
        .map((d) => d.variantType),
    ),
  ].sort();

  const filteredDups = offerItems
    .filter((item) => {
      if (selectedVariantIds.has(item.stickerVariantId)) return false;
      if (item.tradeHidden) return false;
      if (offerQtyFilter === 'duplicate' && item.quantity < 2) return false;
      if (offerQtyFilter === 'single' && item.quantity !== 1) return false;
      if (offerTheyNeedOnly && !suggestedSet.has(item.albumCode)) return false;
      if (offerVariantFilters.length > 0 && !offerVariantFilters.includes(item.variantType)) return false;
      if (!offerSearch) return true;
      const q = offerSearch.toLowerCase();
      return (
        item.albumCode.toLowerCase().includes(q) ||
        (item.playerName?.toLowerCase().includes(q) ?? false) ||
        (item.teamName?.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => {
      const aS = suggestedSet.has(a.albumCode) ? 0 : 1;
      const bS = suggestedSet.has(b.albumCode) ? 0 : 1;
      return aS - bS || a.albumCode.localeCompare(b.albumCode);
    });

  const suggestions = wantItems.filter((w) => w.fromSuggestion);
  const wantVariants = [
    ...new Set(
      suggestions
        .filter((w) => !w.loading && !w.error)
        .flatMap((w) => w.allVariants.map((v) => v.variantType)),
    ),
  ].sort();
  const filteredSuggestions = suggestions.filter((w) => {
    if (w.selected) return false;
    if (w.loading) return true;
    if (wantMissingOnly && ownedAlbumCodes.has(w.albumCode)) return false;
    if (wantFavouritedOnly && !favouriteCodes.has(w.albumCode)) return false;
    if (
      wantVariantFilters.length > 0 &&
      !w.allVariants.some((v) => wantVariantFilters.includes(v.variantType))
    )
      return false;
    if (wantSearch) {
      const q = wantSearch.toLowerCase();
      return (
        w.albumCode.toLowerCase().includes(q) ||
        (w.playerName?.toLowerCase().includes(q) ?? false) ||
        (w.teamName?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const selectedWants = wantItems.filter((w) => w.selected);
  const selectedWantCount = wantItems.filter(
    (w) => w.selected && !w.loading && !w.error && w.variantId,
  ).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">

      {/* ── Picker panels ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ── Offer Panel ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-blue-100 bg-[var(--cromo-accent-soft)] p-4 flex flex-col gap-2.5 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-sm font-semibold text-[var(--cromo-accent)]">You're Offering</h3>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] overflow-hidden text-[11px] font-medium">
              {(['', 'duplicate', 'single'] as const).map((v) => {
                const label = v === '' ? 'All' : v === 'duplicate' ? 'Extras' : 'Last copy';
                return (
                  <button
                    key={v}
                    onClick={() => setOfferQtyFilter(v)}
                    className={`flex-1 px-2 py-1.5 transition-colors ${
                      offerQtyFilter === v
                        ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                        : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {suggestedOfferCodes.length > 0 && (
              <button
                onClick={() => setOfferTheyNeedOnly((v) => !v)}
                className={`w-full px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                  offerTheyNeedOnly
                    ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] border-[var(--cromo-accent)]'
                    : 'bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border)] hover:bg-[var(--cromo-surface-2)]'
                }`}
              >
                They Need
              </button>
            )}

            <input
              type="text"
              value={offerSearch}
              onChange={(e) => setOfferSearch(e.target.value)}
              placeholder="Search by code or player..."
              className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
            />

            {offerVariants.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setOfferVariantFilters([])}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    offerVariantFilters.length === 0
                      ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                      : 'bg-[var(--cromo-surface)] border border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                  }`}
                >
                  All
                </button>
                {offerVariants.map((v) => (
                  <button
                    key={v}
                    onClick={() =>
                      setOfferVariantFilters((prev) =>
                        prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                      )
                    }
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      offerVariantFilters.includes(v)
                        ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                        : 'bg-[var(--cromo-surface)] border border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                    }`}
                  >
                    {variantLabel(v)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {offerItemsLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-11 rounded-lg bg-[var(--cromo-surface-2)]/60 animate-pulse" />
              ))
            ) : filteredDups.length === 0 ? (
              <p className="text-xs text-[var(--cromo-fg-subtle)] text-center py-6">
                {offerItems.length === 0
                  ? 'No stickers in your collection for this album.'
                  : 'No stickers match your filters.'}
              </p>
            ) : (
              filteredDups.map((item) => {
                const isSelected = selectedVariantIds.has(item.stickerVariantId);
                const isSuggested = suggestedSet.has(item.albumCode);
                const isLastCopy = item.quantity === 1;
                return (
                  <div
                    key={item.stickerVariantId}
                    onClick={() => toggleOffer(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleOffer(item) : undefined}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left w-full transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
                        : isLastCopy
                          ? 'border-amber-100 bg-[var(--cromo-warning-soft)]/60 hover:border-[var(--cromo-warning)]/30 hover:bg-[var(--cromo-warning-soft)]'
                          : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-accent)]/30 hover:bg-[var(--cromo-accent-soft)]/50'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-2.5 h-2.5 rounded-full border ${variantSwatch(item.variantType)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-semibold text-[var(--cromo-fg)] truncate">
                          {item.albumCode}
                        </span>
                        {isSuggested && (
                          <span className="shrink-0 text-[9px] font-medium text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 px-1 py-px rounded leading-none">
                            they need
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--cromo-fg-subtle)] truncate">
                        {variantLabel(item.variantType)}
                        {item.playerName ? ` · ${item.playerName}` : ''}
                      </div>
                    </div>
                    {isLastCopy ? (
                      <span className="shrink-0 text-[9px] font-medium text-[var(--cromo-warning)] bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-1 py-px rounded leading-none">
                        last copy
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-[var(--cromo-fg-subtle)] tabular-nums">
                        ×{item.quantity}
                      </span>
                    )}
                    {onHideSticker && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onHideSticker(item.stickerVariantId); }}
                        title="Hide from trades"
                        className="shrink-0 text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger)] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                        </svg>
                      </button>
                    )}
                    <span
                      className={`shrink-0 text-sm font-medium transition-colors ${
                        isSelected ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg-subtle)]'
                      }`}
                    >
                      {isSelected ? '✓' : '+'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Want Panel ──────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-emerald-100 bg-[var(--cromo-success-soft)] p-4 flex flex-col gap-2.5 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-sm font-semibold text-[var(--cromo-success)]">You Want</h3>
          </div>

          {suggestions.length > 0 ? (
            <div className="flex flex-col flex-1 min-h-0 gap-2.5">
              <div className="flex flex-col gap-2 shrink-0">
                <input
                  type="text"
                  value={wantSearch}
                  onChange={(e) => setWantSearch(e.target.value)}
                  placeholder="Search by code or player..."
                  className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--cromo-success)]"
                />

                <div className="flex gap-1.5">
                  <button
                    onClick={() => setWantMissingOnly((v) => !v)}
                    className={`flex-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                      wantMissingOnly
                        ? 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)] border-[var(--cromo-success)]'
                        : 'bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border)] hover:bg-[var(--cromo-surface-2)]'
                    }`}
                  >
                    I Need
                  </button>
                  {favouriteCodes.size > 0 && (
                    <button
                      onClick={() => setWantFavouritedOnly((v) => !v)}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                        wantFavouritedOnly
                          ? 'bg-[var(--cromo-warning)] text-[var(--cromo-warning-fg)] border-[var(--cromo-warning)]'
                          : 'bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border)] hover:bg-[var(--cromo-surface-2)]'
                      }`}
                    >
                      <HeartIcon filled className="w-3 h-3" />
                      Favourited
                    </button>
                  )}
                </div>

                {wantVariants.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setWantVariantFilters([])}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                        wantVariantFilters.length === 0
                          ? 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]'
                          : 'bg-[var(--cromo-surface)] border border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                      }`}
                    >
                      All
                    </button>
                    {wantVariants.map((v) => (
                      <button
                        key={v}
                        onClick={() =>
                          setWantVariantFilters((prev) =>
                            prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                          )
                        }
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          wantVariantFilters.includes(v)
                            ? 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]'
                            : 'bg-[var(--cromo-surface)] border border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                        }`}
                      >
                        {variantLabel(v)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {filteredSuggestions.map((w) => {
                  const isFavourited = favouriteCodes.has(w.albumCode);
                  return (
                    <button
                      key={w.key}
                      disabled={w.loading || !!w.error}
                      onClick={() => toggleWantSuggestion(w.key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left w-full transition-colors disabled:opacity-50 ${
                        w.selected
                          ? 'border-emerald-400 bg-[var(--cromo-success-soft)]'
                          : isFavourited
                            ? 'border-[var(--cromo-warning)]/30 bg-[var(--cromo-warning-soft)] hover:border-[var(--cromo-warning)]/40 hover:bg-[var(--cromo-warning-soft)]/60'
                            : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-success)]/30 hover:bg-[var(--cromo-success-soft)]'
                      }`}
                    >
                      {w.loading ? (
                        <div className="flex-1 h-3 bg-[var(--cromo-surface-2)] animate-pulse rounded" />
                      ) : (
                        <>
                          <span
                            className={`shrink-0 w-2.5 h-2.5 rounded-full border ${variantSwatch(w.variantType)}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs font-semibold text-[var(--cromo-fg)] truncate">
                                {w.albumCode}
                              </span>
                              {isFavourited && (
                                <span
                                  className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium text-[var(--cromo-warning)] bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-1 py-px rounded leading-none"
                                  title="In your favourites"
                                >
                                  <HeartIcon filled className="w-2 h-2" />
                                  want
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--cromo-fg-subtle)] truncate">
                              {variantLabel(w.variantType)}
                              {w.playerName ? ` · ${w.playerName}` : ''}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 text-sm font-medium transition-colors ${
                              w.selected ? 'text-[var(--cromo-success)]' : 'text-[var(--cromo-fg-subtle)]'
                            }`}
                          >
                            {w.selected ? '✓' : '+'}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="flex-1 flex items-center justify-center text-xs text-[var(--cromo-fg-subtle)] text-center">
              No stickers available from this partner.
            </p>
          )}
        </div>
      </div>

      {/* ── Trade Summary Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-4 py-3 flex flex-col gap-2">
        {/* Offering row */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-xs font-semibold text-[var(--cromo-accent)] w-14 pt-1">Offering</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
            {selectedOffers.length === 0 ? (
              <span className="text-xs text-[var(--cromo-fg-subtle)] italic">Nothing selected yet</span>
            ) : (
              selectedOffers.map((o) => (
                <div
                  key={o.variantId}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--cromo-accent)]/30 bg-[var(--cromo-surface)] px-2 py-1 shrink-0"
                >
                  <span className={`w-2 h-2 rounded-full border shrink-0 ${variantSwatch(o.variantType)}`} />
                  <span className="text-xs font-semibold text-[var(--cromo-fg)]">{o.albumCode}</span>
                  {suggestedSet.has(o.albumCode) && (
                    <span className="shrink-0 text-[9px] font-medium text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 px-1 py-px rounded leading-none">
                      they need
                    </span>
                  )}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => adjustOfferQty(o.variantId, -1)}
                      disabled={o.quantity <= 1}
                      className="w-4 h-4 flex items-center justify-center rounded text-xs font-bold text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)] disabled:opacity-30 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs text-[var(--cromo-fg-muted)] tabular-nums">×{o.quantity}</span>
                    <button
                      onClick={() => adjustOfferQty(o.variantId, 1)}
                      disabled={o.quantity >= o.maxQty}
                      className="w-4 h-4 flex items-center justify-center rounded text-xs font-bold text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)] disabled:opacity-30 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedOffers((prev) => prev.filter((x) => x.variantId !== o.variantId))}
                    className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger)] transition-colors text-base leading-none"
                    aria-label={`Remove ${o.albumCode}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1.5 pt-1">
            {selectedOffers.length > 0 && (
              <span className="text-xs font-medium text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] px-2 py-0.5 rounded-full tabular-nums">
                {selectedOffers.length} {selectedOffers.length === 1 ? 'item' : 'items'}
              </span>
            )}
            <CashInput value={offerCashInput} onChange={setOfferCashInput} accent="blue" />
          </div>
        </div>

        <div className="h-px bg-[var(--cromo-surface-2)]" />

        {/* Wanting row */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-xs font-semibold text-[var(--cromo-success)] w-14 pt-1">Wanting</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
            {selectedWants.length === 0 ? (
              <span className="text-xs text-[var(--cromo-fg-subtle)] italic">Nothing selected yet</span>
            ) : (
              selectedWants.map((w) =>
                w.loading ? (
                  <div key={w.key} className="w-16 h-7 rounded-md bg-[var(--cromo-surface-2)] animate-pulse shrink-0" />
                ) : w.error ? (
                  <div key={w.key} className="flex items-center gap-1 rounded-md border border-[var(--cromo-danger)]/20 bg-[var(--cromo-surface)] px-2 py-1 shrink-0">
                    <span className="text-xs text-[var(--cromo-danger)]">{w.albumCode}</span>
                    <button
                      onClick={() => toggleWantSuggestion(w.key)}
                      className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger)] transition-colors text-base leading-none"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div key={w.key} className="flex items-center gap-1.5 rounded-md border border-[var(--cromo-success)]/30 bg-[var(--cromo-surface)] px-2 py-1 shrink-0">
                    <span className={`w-2 h-2 rounded-full border shrink-0 ${variantSwatch(w.variantType)}`} />
                    <span className="text-xs font-semibold text-[var(--cromo-fg)]">{w.albumCode}</span>
                    {!ownedAlbumCodes.has(w.albumCode) && (
                      <span className="shrink-0 text-[9px] font-medium text-[var(--cromo-tier-very-rare)] bg-[var(--cromo-tier-very-rare)]/10 border border-[var(--cromo-tier-very-rare)]/30 px-1 py-px rounded leading-none">
                        I need
                      </span>
                    )}
                    {favouriteCodes.has(w.albumCode) && (
                      <span className="shrink-0 inline-flex items-center text-[var(--cromo-warning)] bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-1 py-px rounded leading-none" title="In your favourites">
                        <HeartIcon filled className="w-2 h-2" />
                      </span>
                    )}
                    {w.allVariants.length > 1 && (
                      <select
                        value={w.variantId}
                        onChange={(e) => {
                          const v = w.allVariants.find((v) => v.id === e.target.value);
                          if (v) changeWantVariant(w.key, v);
                        }}
                        className="rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-1 py-0.5 text-[11px] text-[var(--cromo-fg)] focus:outline-none"
                      >
                        {w.allVariants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {variantLabel(v.variantType)}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => toggleWantSuggestion(w.key)}
                      className="shrink-0 text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger)] transition-colors text-base leading-none"
                      aria-label={`Remove ${w.albumCode}`}
                    >
                      ×
                    </button>
                  </div>
                )
              )
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1.5 pt-1">
            {selectedWantCount > 0 && (
              <span className="text-xs font-medium text-[var(--cromo-success)] bg-[var(--cromo-success-soft)] px-2 py-0.5 rounded-full tabular-nums">
                {selectedWantCount} {selectedWantCount === 1 ? 'item' : 'items'}
              </span>
            )}
            <CashInput value={wantCashInput} onChange={setWantCashInput} accent="emerald" />
          </div>
        </div>
      </div>

    </div>
  );
}
