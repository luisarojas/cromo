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
  fetchPublicProfile,
  createTrade,
  setTradeFlags,
  patchUserPreferences,
  matchAgainstMe,
  albumDisplayName,
  type UserAlbum,
  type TradeMatch,
  type TradeSummary,
  type CollectionItem,
  type City,
  type MatchAgainstMeResult,
} from '@/lib/api';
import { type TradePickerItem } from './components/TradeStickerPicker';
import ProposeTradeModal from './components/ProposeTradeModal';
import CombinedListInput from './components/CombinedListInput';
import ExternalMatchResult from './components/ExternalMatchResult';
import TradesList from './components/TradesList';
import { publishSync, subscribeSync } from '@/lib/syncBus';
import CityAutocomplete from '@/components/CityAutocomplete';

import { saveDraft, clearDraft, loadDraft } from './draftStorage';

type Tab = 'find' | 'third-party' | 'my';

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
  draftWantVariants?: { variantId: string; quantity: number }[];
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
  const initialTab: Tab =
    rawTab === 'my' ? 'my'
    : rawTab === 'third-party' ? 'third-party'
    : 'find';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [nearbyOnly, setNearbyOnly] = useState(false);

  // Deep link: /trade?recipient=<username> opens the propose modal for that
  // user. If the viewer has an album selected we also run Find Matches in
  // parallel so the modal can pre-suggest mutually-needed stickers; otherwise
  // the modal opens with empty suggestions (trade without a match).
  const recipientHint = searchParams.get('recipient');
  const recipientHandledRef = useRef(false);
  const recipientProfileFetchedRef = useRef(false);
  const [recipientProfile, setRecipientProfile] = useState<TradeMatch | null>(null);
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
  // Cross-tab reload counter — bumped when another tab signals a collection
  // change. The trades-load effect depends on it so My Trades stays fresh
  // even if the user accepted/declined in a second window.
  const [tradesReloadTick, setTradesReloadTick] = useState(0);

  // Third-party (external list) state
  const [tpAlbumId, setTpAlbumId] = useState<string>('');
  const [tpOffered, setTpOffered] = useState<string[]>([]);
  const [tpWanted, setTpWanted] = useState<string[]>([]);
  const [tpResult, setTpResult] = useState<MatchAgainstMeResult | null>(null);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);

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
            setTpAlbumId(defaultAlbum!.id);
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
  }, [tab, token, tradesReloadTick]);

  // Cross-tab refresh for My Trades. Listens to the narrowly-scoped
  // trade:changed event (published from every trade mutation: create,
  // accept, decline, cancel, complete, message-send) so the list stays
  // fresh without over-refreshing on every sticker add elsewhere.
  useEffect(() => {
    if (!user) return;
    return subscribeSync((event) => {
      if (event.type !== 'trade:changed') return;
      if (event.userId !== user.id) return;
      setTradesReloadTick((n) => n + 1);
    });
  }, [user]);

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

  // Deep-link from a public profile: fetch the recipient's public profile so
  // we can open the propose modal even when there's no mutual-overlap match.
  useEffect(() => {
    if (recipientProfileFetchedRef.current || !recipientHint || !token) return;
    recipientProfileFetchedRef.current = true;
    fetchPublicProfile(recipientHint)
      .then((p) => {
        setRecipientProfile({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          mutualOverlap: 0,
          theyHave: [],
          theyHaveVariantIds: [],
          youHave: [],
          cities: [],
        });
      })
      .catch(() => setRecipientNotFound(true));
  }, [recipientHint, token]);

  // Deep-link from a public profile: if the viewer has an album selected,
  // also run Find Matches in parallel so the propose modal can pre-suggest
  // mutually-needed stickers when there is overlap.
  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !token || !selectedAlbumId) return;
    if (matchesLoading || matchesSearched) return;
    void handleFindMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientHint, token, selectedAlbumId]);

  // Open the propose modal once we have the recipient's profile. If we also
  // searched matches and found the recipient there, prefer the richer match
  // payload (includes youHave / theyHave suggestions).
  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !recipientProfile) return;
    if (selectedAlbumId && !matchesSearched) return;
    recipientHandledRef.current = true;
    const enriched = matches.find((m) => m.username === recipientProfile.username);
    openProposeModal(enriched ?? recipientProfile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, matchesSearched, recipientHint, recipientProfile, selectedAlbumId]);

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
      offerItemsLoading: !!selectedAlbumId && cached === undefined,
      draftOfferVariants: draft?.offerVariants,
      draftWantVariants: draft?.wantVariants,
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
    await setTradeHiddenFlag(variantId, true);
  }
  async function handleUnhideSticker(variantId: string) {
    await setTradeHiddenFlag(variantId, false);
  }
  async function setTradeHiddenFlag(variantId: string, hidden: boolean) {
    if (!user || !token || !selectedAlbumId) return;
    setProposeModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        offerItems: prev.offerItems.map((item) =>
          item.stickerVariantId === variantId ? { ...item, tradeHidden: hidden } : item,
        ),
      };
    });
    // Keep the per-album cache aligned with the optimistic update so the next
    // openProposeModal doesn't show a stale tradeHidden value.
    offerItemsCacheRef.current.delete(selectedAlbumId);
    try {
      await setTradeFlags(user.id, variantId, { tradeHidden: hidden }, token, selectedAlbumId);
    } catch {
      setProposeModal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          offerItems: prev.offerItems.map((item) =>
            item.stickerVariantId === variantId ? { ...item, tradeHidden: !hidden } : item,
          ),
        };
      });
    }
  }

  async function handleTpMatch() {
    if (!token || !tpAlbumId) return;
    if (tpOffered.length === 0 && tpWanted.length === 0) {
      setTpError('Add at least one code to the offered or wanted list.');
      return;
    }
    setTpLoading(true);
    setTpError(null);
    try {
      const result = await matchAgainstMe(
        { albumId: tpAlbumId, theirOffered: tpOffered, theirWanted: tpWanted },
        token,
      );
      setTpResult(result);
    } catch (err) {
      setTpError(err instanceof Error ? err.message : 'Failed to compute match.');
    } finally {
      setTpLoading(false);
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
      if (user) publishSync({ type: 'trade:changed', userId: user.id, tradeId: result.id });
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
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--cromo-fg)]">Trades</h1>
        <p className="text-sm text-[var(--cromo-fg-muted)] mt-1">
          Find trading partners or manage your active trades.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">Your cities</label>
        <CityAutocomplete cities={myCities} onChange={handleCitiesChange} />
        {citiesSaving && <p className="mt-1.5 text-xs text-[var(--cromo-fg-subtle)]">Saving…</p>}
        {citiesError && <p className="mt-1.5 text-xs text-[var(--cromo-danger-text)]">{citiesError}</p>}
        <p className="mt-1.5 text-xs text-[var(--cromo-fg-subtle)]">Used to filter trade matches by location.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--cromo-border)]">
        <button
          onClick={() => switchTab('find')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'find'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          Find Trades
        </button>
        <button
          onClick={() => switchTab('third-party')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'third-party'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          Third-Party List
        </button>
        <button
          onClick={() => switchTab('my')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'my'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          My Trades
        </button>
      </div>

      {/* Find Trades tab */}
      {tab === 'find' && (
        <div>
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-3">Find Trading Partners</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">Album</label>
                <select
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
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
                className="bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {matchesLoading ? 'Searching...' : 'Find Matches'}
              </button>
            </div>
          </div>

          {matchesError && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">
              {matchesError}
            </div>
          )}

          {recipientNotFound && (
            <div className="rounded-lg bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 p-3 text-sm text-amber-800 mb-4">
              Couldn&apos;t find that user.
            </div>
          )}

          {matchesLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
              ))}
            </div>
          )}

          {!matchesLoading && matches.length === 0 && !matchesError && selectedAlbumId && (
            <p className="text-sm text-[var(--cromo-fg-muted)] text-center py-8">
              {matchesSearched ? 'No matches found.' : 'Click "Find Matches" to search.'}
            </p>
          )}

          {!matchesLoading && matches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-[var(--cromo-fg-muted)]">
                  Found {matches.length} potential {matches.length === 1 ? 'partner' : 'partners'}
                  {nearbyOnly && myCities.length > 0 && ` · ${visibleMatches.length} nearby`}
                </p>
                {myCities.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nearbyOnly}
                      onChange={(e) => setNearbyOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
                    />
                    <span className="text-sm text-[var(--cromo-fg-muted)]">Nearby only</span>
                  </label>
                )}
              </div>
              {visibleMatches.length === 0 && nearbyOnly && (
                <p className="text-sm text-[var(--cromo-fg-muted)] text-center py-6">
                  No matches share your cities. Try disabling &quot;Nearby only&quot; or add more cities in Settings.
                </p>
              )}
              {matchesTotal > matches.length && (
                <p className="text-xs text-[var(--cromo-fg-subtle)]">
                  Showing {matches.length} of {matchesTotal}
                </p>
              )}
              {visibleMatches.map((match) => (
                <div
                  key={match.userId}
                  className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 flex items-center gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-sm font-bold text-[var(--cromo-accent-fg)]">
                    {(match.displayName ?? match.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--cromo-fg)] truncate">
                      {match.displayName ?? match.username}
                    </div>
                    <div className="text-xs text-[var(--cromo-fg-muted)]">@{match.username}</div>
                    <div className="mt-1 flex gap-3 text-xs text-[var(--cromo-fg-muted)] flex-wrap">
                      <span className="text-[var(--cromo-accent)] font-medium">
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
                                ? 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]'
                                : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]'
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
                    className="bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium transition-colors shrink-0"
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
                    className="bg-[var(--cromo-surface-2)] hover:bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {matchesMoreLoading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Third-Party tab — match a non-registered person's list against you */}
      {tab === 'third-party' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-1">
              Match someone&apos;s list against your collection
            </h2>
            <p className="text-xs text-[var(--cromo-fg-muted)] mb-4">
              Paste a friend&apos;s offered and wanted album codes, or upload a photo
              of their list. We&apos;ll show what you could trade with them — no
              account on their side required.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">Album</label>
              <select
                value={tpAlbumId}
                onChange={(e) => setTpAlbumId(e.target.value)}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
              >
                {albums.length === 0 && <option value="">No albums found</option>}
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>{albumDisplayName(album)}</option>
                ))}
              </select>
            </div>

            <CombinedListInput
              label="Their list"
              offered={tpOffered}
              wanted={tpWanted}
              onChange={({ offered, wanted }) => { setTpOffered(offered); setTpWanted(wanted); }}
              albumTypeKey={albums.find((a) => a.id === tpAlbumId)?.albumTypeKey}
              token={token ?? undefined}
            />

            <button
              onClick={handleTpMatch}
              disabled={!tpAlbumId || tpLoading}
              className="mt-4 bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {tpLoading ? 'Matching…' : 'Find Trade'}
            </button>

            {tpError && (
              <p className="mt-2 text-xs text-[var(--cromo-danger-text)]">{tpError}</p>
            )}
          </div>

          {tpResult && (
            <ExternalMatchResult
              title="Optimal trade"
              leftLabel="You"
              leftReceives={tpResult.iGet}
              rightLabel="They"
              rightReceives={tpResult.theyGet}
              mutualOverlap={tpResult.mutualOverlap}
              unknownCodes={tpResult.unknownCodes}
            />
          )}
        </div>
      )}

      {/* My Trades tab */}
      {tab === 'my' && (
        <div>
          {tradesError && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">
              {tradesError}
            </div>
          )}

          {tradesLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
              ))}
            </div>
          )}

          {!tradesLoading && !tradesError && trades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--cromo-fg-muted)]">You have no trades yet.</p>
              <button
                onClick={() => switchTab('find')}
                className="mt-3 text-sm text-[var(--cromo-accent)] hover:underline"
              >
                Find trading partners
              </button>
            </div>
          )}

          {!tradesLoading && trades.length > 0 && (
            <div className="space-y-2">
              {user && (
                <TradesList
                  trades={trades}
                  myUserId={user.id}
                  onOpen={(id) => router.push(`/trade/${id}`)}
                />
              )}
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
                  className="w-full text-sm text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] font-medium py-3 disabled:opacity-50"
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
          initialWantVariants={proposeModal.draftWantVariants}
          initialOfferCash={proposeModal.draftOfferCash}
          initialWantCash={proposeModal.draftWantCash}
          onHideSticker={handleHideSticker}
          onUnhideSticker={handleUnhideSticker}
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
        <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
          Loading…
        </div>
      }
    >
      <TradePageContent />
    </Suspense>
  );
}
