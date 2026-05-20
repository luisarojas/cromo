'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import {
  fetchUserAlbums,
  fetchTradeMatches,
  fetchTrades,
  fetchCollection,
  fetchFavourites,
  createTrade,
  setTradeFlags,
  patchUserPreferences,
  albumDisplayName,
  type UserAlbum,
  type TradeMatch,
  type TradeSummary,
  type CollectionItem,
  type City,
} from '@/lib/api';
import { type TradePickerItem } from './components/TradeStickerPicker';
import ProposeTradeModal from './components/ProposeTradeModal';
import CityAutocomplete from '@/components/CityAutocomplete';

import { saveDraft, clearDraft, loadDraft } from './draftStorage';

type Tab = 'find' | 'my';

const STATUS_BADGE: Record<TradeSummary['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', className: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expired', className: 'bg-gray-100 text-gray-700' },
};

interface ProposeModalState {
  match: TradeMatch;
  pickerItems: TradePickerItem[];
  offerCash: number;
  wantCash: number;
  submitting: boolean;
  error: string | null;
  offerItems: CollectionItem[];
  offerItemsLoading: boolean;
  draftOfferVariants?: { variantId: string; quantity: number }[];
  draftWantVariantIds?: string[];
  draftOfferCash?: number;
  draftWantCash?: number;
}

function TradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const myCities = usePreferencesStore((s) => s.cities);
  const setCities = usePreferencesStore((s) => s.setCities);

  const [citiesSaving, setCitiesSaving] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  async function handleCitiesChange(next: City[]) {
    if (!token) return;
    setCities(next);
    setCitiesSaving(true);
    setCitiesError(null);
    try {
      await patchUserPreferences({ cities: next }, token);
    } catch {
      setCitiesError('Failed to save. Please try again.');
    } finally {
      setCitiesSaving(false);
    }
  }

  const rawTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(rawTab === 'my' ? 'my' : 'find');
  const [nearbyOnly, setNearbyOnly] = useState(false);

  // Deep link: /trade?recipient=<userId> auto-runs Find Matches and opens the
  // propose modal for that user. Cleared once handled so a manual refresh
  // doesn't re-trigger.
  const recipientHint = searchParams.get('recipient');
  const recipientHandledRef = useRef(false);
  // Per-album cache of the propose-modal's offer-picker collection so opening
  // multiple matches in the same album doesn't refetch up to 1000 items.
  // Cleared whenever the active album changes or trade flags are mutated.
  const offerItemsCacheRef = useRef<Map<string, CollectionItem[]>>(new Map());
  const [recipientNotFound, setRecipientNotFound] = useState(false);

  function switchTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/trade?${params.toString()}`);
  }

  // Find Trades state
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [favouriteCodes, setFavouriteCodes] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesMoreLoading, setMatchesMoreLoading] = useState(false);
  const [matchesCursor, setMatchesCursor] = useState<string | null>(null);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesSearched, setMatchesSearched] = useState(false);

  // My Trades state
  const [trades, setTrades] = useState<TradeSummary[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesMoreLoading, setTradesMoreLoading] = useState(false);
  const [tradesCursor, setTradesCursor] = useState<string | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);

  // Propose modal
  const [proposeModal, setProposeModal] = useState<ProposeModalState | null>(null);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function loadAlbums() {
      if (!token || !user) return;
      try {
        const data = await fetchUserAlbums(user.id, token);
        if (!cancelled) {
          setAlbums(data);
          if (data.length > 0) {
            const defaultAlbum = data.find((a) => a.isDefault) ?? data[0];
            setSelectedAlbumId(defaultAlbum!.id);
          }
        }
      } catch {
        // non-fatal
      }
    }

    loadAlbums();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router]);

  useEffect(() => {
    if (tab !== 'my' || !token) return;

    let cancelled = false;

    async function loadTrades() {
      if (!token) return;
      setTradesLoading(true);
      setTradesError(null);
      try {
        const { items, nextCursor } = await fetchTrades({}, token);
        if (!cancelled) {
          setTrades(items);
          setTradesCursor(nextCursor);
        }
      } catch (err) {
        if (!cancelled)
          setTradesError(err instanceof Error ? err.message : 'Failed to load trades');
      } finally {
        if (!cancelled) setTradesLoading(false);
      }
    }

    loadTrades();
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  useEffect(() => {
    if (!selectedAlbumId || !token || !user) {
      setFavouriteCodes(new Set());
      return;
    }
    let cancelled = false;
    fetchFavourites(user.id, selectedAlbumId, token)
      .then((codes) => {
        if (!cancelled) setFavouriteCodes(new Set(codes));
      })
      .catch(() => {
        if (!cancelled) setFavouriteCodes(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAlbumId, token, user]);

  // Auto-restore a trade draft if the user refreshed mid-proposal
  useEffect(() => {
    if (draftRestoredRef.current || !hydrated || !token || !user || !selectedAlbumId) return;
    const draft = loadDraft();
    if (!draft) return;
    draftRestoredRef.current = true;
    openProposeModal(draft.match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, selectedAlbumId]);

  // Deep-link from a public profile: auto-run Find Matches once the album is
  // selected, then auto-open the propose modal for that recipient.
  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !token || !selectedAlbumId) return;
    if (matchesLoading || matchesSearched) return;
    void handleFindMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientHint, token, selectedAlbumId]);

  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !matchesSearched) return;
    const target = matches.find((m) => m.userId === recipientHint);
    recipientHandledRef.current = true;
    if (target) {
      openProposeModal(target);
    } else {
      setRecipientNotFound(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, matchesSearched, recipientHint]);

  async function handleFindMatches() {
    if (!token || !selectedAlbumId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    setMatches([]);
    setMatchesCursor(null);
    setMatchesTotal(0);
    setMatchesSearched(false);
    try {
      const page = await fetchTradeMatches(selectedAlbumId, token);
      setMatches(page.items);
      setMatchesCursor(page.nextCursor);
      setMatchesTotal(page.total);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to find matches');
    } finally {
      setMatchesLoading(false);
      setMatchesSearched(true);
    }
  }

  async function handleLoadMoreMatches() {
    if (!token || !selectedAlbumId || !matchesCursor || matchesMoreLoading) return;
    setMatchesMoreLoading(true);
    try {
      const page = await fetchTradeMatches(selectedAlbumId, token, { cursor: matchesCursor });
      setMatches((prev) => [...prev, ...page.items]);
      setMatchesCursor(page.nextCursor);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to load more matches');
    } finally {
      setMatchesMoreLoading(false);
    }
  }

  function openProposeModal(match: TradeMatch) {
    const draft = loadDraft(match.userId);

    // Re-use a previously-fetched collection for the same album so opening
    // several matches in a row doesn't refetch up to 1000 items every time.
    const cached = selectedAlbumId
      ? offerItemsCacheRef.current.get(selectedAlbumId)
      : undefined;

    setProposeModal({
      match,
      pickerItems: [],
      offerCash: draft?.offerCashCents ?? 0,
      wantCash: draft?.wantCashCents ?? 0,
      submitting: false,
      error: null,
      offerItems: cached ?? [],
      offerItemsLoading: cached === undefined,
      draftOfferVariants: draft?.offerVariants,
      draftWantVariantIds: draft?.wantVariantIds,
      draftOfferCash: draft?.offerCashCents,
      draftWantCash: draft?.wantCashCents,
    });

    if (cached !== undefined) return;

    if (token && user && selectedAlbumId) {
      const albumIdAtFetch = selectedAlbumId;
      fetchCollection(user.id, { albumId: albumIdAtFetch, limit: 1000 }, token)
        .then((result) => {
          offerItemsCacheRef.current.set(albumIdAtFetch, result.items);
          setProposeModal((prev) =>
            prev ? { ...prev, offerItems: result.items, offerItemsLoading: false } : prev,
          );
        })
        .catch(() => {
          setProposeModal((prev) => (prev ? { ...prev, offerItemsLoading: false } : prev));
        });
    }
  }

  async function handleHideSticker(variantId: string) {
    if (!user || !token || !selectedAlbumId) return;
    setProposeModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        offerItems: prev.offerItems.map((item) =>
          item.stickerVariantId === variantId ? { ...item, tradeHidden: true } : item,
        ),
      };
    });
    // Keep the per-album cache aligned with the optimistic update so the next
    // openProposeModal doesn't show a stale tradeHidden value.
    offerItemsCacheRef.current.delete(selectedAlbumId);
    try {
      await setTradeFlags(user.id, variantId, { tradeHidden: true }, token, selectedAlbumId);
    } catch {
      setProposeModal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          offerItems: prev.offerItems.map((item) =>
            item.stickerVariantId === variantId ? { ...item, tradeHidden: false } : item,
          ),
        };
      });
    }
  }

  async function handleSendTradeRequest() {
    if (!proposeModal || !token || !user) return;

    const { pickerItems, offerCash, wantCash } = proposeModal;
    const hasOffer = pickerItems.some((i) => i.direction === 'offer') || offerCash > 0;
    const hasWant = pickerItems.some((i) => i.direction === 'want') || wantCash > 0;

    if (!hasOffer || !hasWant) {
      setProposeModal((prev) =>
        prev ? { ...prev, error: 'Add at least one sticker or cash amount to offer and to request.' } : prev,
      );
      return;
    }

    setProposeModal((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));

    try {
      const result = await createTrade(
        {
          recipientId: proposeModal.match.userId,
          requesterAlbumId: selectedAlbumId || undefined,
          items: pickerItems.map((i) => ({ variantId: i.variantId, direction: i.direction, quantity: i.quantity })),
          offerCash,
          wantCash,
        },
        token,
      );
      clearDraft();
      setProposeModal(null);
      router.push(`/trade/${result.id}`);
    } catch (err) {
      setProposeModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              error: err instanceof Error ? err.message : 'Failed to send trade request',
            }
          : prev,
      );
    }
  }

  const visibleMatches = nearbyOnly && myCities.length > 0
    ? matches.filter((m) => m.cities.some((c) => myCities.some((mc) => mc.placeId === c.placeId)))
    : matches;

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Trades</h1>
        <p className="text-sm text-gray-500 mt-1">
          Find trading partners or manage your active trades.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-600 mb-2">Your cities</label>
        <CityAutocomplete cities={myCities} onChange={handleCitiesChange} />
        {citiesSaving && <p className="mt-1.5 text-xs text-gray-400">Saving…</p>}
        {citiesError && <p className="mt-1.5 text-xs text-red-500">{citiesError}</p>}
        <p className="mt-1.5 text-xs text-gray-400">Used to filter trade matches by location.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => switchTab('find')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'find'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Find Trades
        </button>
        <button
          onClick={() => switchTab('my')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'my'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Trades
        </button>
      </div>

      {/* Find Trades tab */}
      {tab === 'find' && (
        <div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Find Trading Partners</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Album</label>
                <select
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {albums.length === 0 && <option value="">No albums found</option>}
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {albumDisplayName(album)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleFindMatches}
                disabled={!selectedAlbumId || matchesLoading}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {matchesLoading ? 'Searching...' : 'Find Matches'}
              </button>
            </div>
          </div>

          {matchesError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
              {matchesError}
            </div>
          )}

          {recipientNotFound && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-4">
              No mutual overlap found with that user in this album yet. Try a different album, or
              check their public profile for what they offer and want.
            </div>
          )}

          {matchesLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          )}

          {!matchesLoading && matches.length === 0 && !matchesError && selectedAlbumId && (
            <p className="text-sm text-gray-500 text-center py-8">
              {matchesSearched ? 'No matches found.' : 'Click "Find Matches" to search.'}
            </p>
          )}

          {!matchesLoading && matches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">
                  Found {matches.length} potential {matches.length === 1 ? 'partner' : 'partners'}
                  {nearbyOnly && myCities.length > 0 && ` · ${visibleMatches.length} nearby`}
                </p>
                {myCities.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nearbyOnly}
                      onChange={(e) => setNearbyOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-sm text-gray-600">Nearby only</span>
                  </label>
                )}
              </div>
              {visibleMatches.length === 0 && nearbyOnly && (
                <p className="text-sm text-gray-500 text-center py-6">
                  No matches share your cities. Try disabling &quot;Nearby only&quot; or add more cities in Settings.
                </p>
              )}
              {matchesTotal > matches.length && (
                <p className="text-xs text-gray-400">
                  Showing {matches.length} of {matchesTotal}
                </p>
              )}
              {visibleMatches.map((match) => (
                <div
                  key={match.userId}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {(match.displayName ?? match.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">
                      {match.displayName ?? match.username}
                    </div>
                    <div className="text-xs text-gray-500">@{match.username}</div>
                    <div className="mt-1 flex gap-3 text-xs text-gray-600 flex-wrap">
                      <span className="text-blue-600 font-medium">
                        {match.mutualOverlap} mutual stickers
                      </span>
                      <span>They have {match.theyHave.length} you need</span>
                      <span>You have {match.youHave.length} they need</span>
                    </div>
                    {match.cities.length > 0 && (
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {match.cities.map((city) => (
                          <span
                            key={city.placeId}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              myCities.some((mc) => mc.placeId === city.placeId)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {city.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openProposeModal(match)}
                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium transition-colors shrink-0"
                  >
                    Propose Trade
                  </button>
                </div>
              ))}
              {matchesCursor && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleLoadMoreMatches}
                    disabled={matchesMoreLoading}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {matchesMoreLoading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* My Trades tab */}
      {tab === 'my' && (
        <div>
          {tradesError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
              {tradesError}
            </div>
          )}

          {tradesLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          )}

          {!tradesLoading && !tradesError && trades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">You have no trades yet.</p>
              <button
                onClick={() => switchTab('find')}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Find trading partners
              </button>
            </div>
          )}

          {!tradesLoading && trades.length > 0 && (
            <div className="space-y-2">
              {trades.map((trade) => {
                const badge = STATUS_BADGE[trade.status];
                const isRequester = trade.requesterId === user?.id;
                const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
                return (
                  <button
                    key={trade.id}
                    onClick={() => router.push(`/trade/${trade.id}`)}
                    className="w-full text-left rounded-xl border border-gray-200 bg-white shadow-sm p-4 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {isRequester ? 'To' : 'From'}: @{otherUser}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(trade.createdAt).toLocaleDateString()} &middot;{' '}
                          {trade.messageCount} {trade.messageCount === 1 ? 'message' : 'messages'}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })}
              {tradesCursor && (
                <button
                  onClick={async () => {
                    if (!token || tradesMoreLoading) return;
                    setTradesMoreLoading(true);
                    try {
                      const { items, nextCursor } = await fetchTrades({ cursor: tradesCursor }, token);
                      setTrades((prev) => [...prev, ...items]);
                      setTradesCursor(nextCursor);
                    } catch (err) {
                      setTradesError(err instanceof Error ? err.message : 'Failed to load more trades');
                    } finally {
                      setTradesMoreLoading(false);
                    }
                  }}
                  disabled={tradesMoreLoading}
                  className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium py-3 disabled:opacity-50"
                >
                  {tradesMoreLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Propose Trade Modal */}
      {proposeModal && token && (
        <ProposeTradeModal
          match={proposeModal.match}
          offerItems={proposeModal.offerItems}
          offerItemsLoading={proposeModal.offerItemsLoading}
          pickerItems={proposeModal.pickerItems}
          error={proposeModal.error}
          submitting={proposeModal.submitting}
          favouriteCodes={favouriteCodes}
          token={token}
          initialOfferVariants={proposeModal.draftOfferVariants}
          initialWantVariantIds={proposeModal.draftWantVariantIds}
          initialOfferCash={proposeModal.draftOfferCash}
          initialWantCash={proposeModal.draftWantCash}
          onHideSticker={handleHideSticker}
          onChange={(items, offerCash, wantCash) => {
            setProposeModal((prev) => {
              if (!prev) return prev;
              saveDraft(prev.match, items, offerCash, wantCash);
              return { ...prev, pickerItems: items, offerCash, wantCash };
            });
          }}
          onCancel={() => { clearDraft(); setProposeModal(null); }}
          onSend={handleSendTradeRequest}
        />
      )}
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
          Loading…
        </div>
      }
    >
      <TradePageContent />
    </Suspense>
  );
}
