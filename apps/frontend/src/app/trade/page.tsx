'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  fetchUserAlbums,
  fetchTradeMatches,
  fetchTrades,
  fetchCollection,
  createTrade,
  setTradeFlags,
  albumDisplayName,
  type UserAlbum,
  type TradeMatch,
  type TradeSummary,
  type CollectionItem,
} from '@/lib/api';
import TradeStickerPicker, { type TradePickerItem } from './components/TradeStickerPicker';

type Tab = 'find' | 'my';

const DRAFT_KEY = 'stickfolio:trade_propose_draft';

interface TradeDraft {
  matchUserId: string;
  match: TradeMatch;
  offerVariants: { variantId: string; quantity: number }[];
  wantVariantIds: string[];
  offerCashCents: number;
  wantCashCents: number;
}

function saveDraft(match: TradeMatch, items: TradePickerItem[], offerCashCents: number, wantCashCents: number) {
  try {
    const draft: TradeDraft = {
      matchUserId: match.user_id,
      match,
      offerVariants: items.filter((i) => i.direction === 'offer').map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      wantVariantIds: items.filter((i) => i.direction === 'want').map((i) => i.variantId),
      offerCashCents,
      wantCashCents,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function loadDraft(matchUserId?: string): TradeDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as TradeDraft;
    if (matchUserId !== undefined && draft.matchUserId !== matchUserId) return null;
    return draft;
  } catch { return null; }
}

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

export default function TradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const rawTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(rawTab === 'my' ? 'my' : 'find');

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
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesSearched, setMatchesSearched] = useState(false);

  // My Trades state
  const [trades, setTrades] = useState<TradeSummary[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
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
            const defaultAlbum = data.find((a) => a.is_default) ?? data[0];
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
        const data = await fetchTrades({}, token);
        if (!cancelled) setTrades(data);
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
    if (!selectedAlbumId) return;
    try {
      const stored = localStorage.getItem(`stickfolio:favourites:${selectedAlbumId}`);
      setFavouriteCodes(new Set(stored ? (JSON.parse(stored) as string[]) : []));
    } catch {
      setFavouriteCodes(new Set());
    }
  }, [selectedAlbumId]);

  // Auto-restore a trade draft if the user refreshed mid-proposal
  useEffect(() => {
    if (draftRestoredRef.current || !hydrated || !token || !user || !selectedAlbumId) return;
    const draft = loadDraft();
    if (!draft) return;
    draftRestoredRef.current = true;
    openProposeModal(draft.match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, selectedAlbumId]);

  async function handleFindMatches() {
    if (!token || !selectedAlbumId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    setMatches([]);
    setMatchesSearched(false);
    try {
      const data = await fetchTradeMatches(selectedAlbumId, token);
      setMatches(data);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to find matches');
    } finally {
      setMatchesLoading(false);
      setMatchesSearched(true);
    }
  }

  function openProposeModal(match: TradeMatch) {
    const draft = loadDraft(match.user_id);

    setProposeModal({
      match,
      pickerItems: [],
      offerCash: draft?.offerCashCents ?? 0,
      wantCash: draft?.wantCashCents ?? 0,
      submitting: false,
      error: null,
      offerItems: [],
      offerItemsLoading: true,
      draftOfferVariants: draft?.offerVariants,
      draftWantVariantIds: draft?.wantVariantIds,
      draftOfferCash: draft?.offerCashCents,
      draftWantCash: draft?.wantCashCents,
    });

    if (token && user && selectedAlbumId) {
      fetchCollection(user.id, { albumId: selectedAlbumId, limit: 1000 }, token)
        .then((result) => {
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
          item.sticker_variant_id === variantId ? { ...item, trade_hidden: true } : item,
        ),
      };
    });
    try {
      await setTradeFlags(user.id, variantId, { tradeHidden: true }, token, selectedAlbumId);
    } catch {
      setProposeModal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          offerItems: prev.offerItems.map((item) =>
            item.sticker_variant_id === variantId ? { ...item, trade_hidden: false } : item,
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
          recipientId: proposeModal.match.user_id,
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
              <p className="text-sm text-gray-500 mb-2">
                Found {matches.length} potential {matches.length === 1 ? 'partner' : 'partners'}
              </p>
              {matches.map((match) => (
                <div
                  key={match.user_id}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {(match.display_name ?? match.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">
                      {match.display_name ?? match.username}
                    </div>
                    <div className="text-xs text-gray-500">@{match.username}</div>
                    <div className="mt-1 flex gap-3 text-xs text-gray-600 flex-wrap">
                      <span className="text-blue-600 font-medium">
                        {match.mutual_overlap} mutual stickers
                      </span>
                      <span>They have {match.they_have.length} you need</span>
                      <span>You have {match.you_have.length} they need</span>
                    </div>
                  </div>
                  <button
                    onClick={() => openProposeModal(match)}
                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium transition-colors shrink-0"
                  >
                    Propose Trade
                  </button>
                </div>
              ))}
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
                const isRequester = trade.requester_id === user?.id;
                const otherUser = isRequester ? trade.recipient_username : trade.requester_username;
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
                          {new Date(trade.created_at).toLocaleDateString()} &middot;{' '}
                          {trade.message_count} {trade.message_count === 1 ? 'message' : 'messages'}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Propose Trade Modal */}
      {proposeModal && token && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">Propose Trade</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                With{' '}
                <span className="font-medium text-gray-700">
                  {proposeModal.match.display_name ?? proposeModal.match.username}
                </span>{' '}
                (@{proposeModal.match.username})
              </p>
            </div>

            {/* Picker */}
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col">
              <TradeStickerPicker
                key={proposeModal.match.user_id}
                offerItems={proposeModal.offerItems}
                offerItemsLoading={proposeModal.offerItemsLoading}
                suggestedOfferCodes={proposeModal.match.you_have}
                suggestedWantCodes={proposeModal.match.they_have}
                suggestedWantVariantIds={proposeModal.match.they_have_variant_ids}
                token={token}
                partnerName={proposeModal.match.display_name ?? proposeModal.match.username}
                favouriteCodes={favouriteCodes}
                onHideSticker={handleHideSticker}
                initialOfferVariants={proposeModal.draftOfferVariants}
                initialWantVariantIds={proposeModal.draftWantVariantIds}
                initialOfferCash={proposeModal.draftOfferCash}
                initialWantCash={proposeModal.draftWantCash}
                onChange={(items, offerCash, wantCash) => {
                  setProposeModal((prev) => {
                    if (!prev) return prev;
                    saveDraft(prev.match, items, offerCash, wantCash);
                    return { ...prev, pickerItems: items, offerCash, wantCash };
                  });
                }}
              />

              {proposeModal.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-4">
                  {proposeModal.error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={() => { clearDraft(); setProposeModal(null); }}
                  disabled={proposeModal.submitting}
                  className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendTradeRequest}
                  disabled={proposeModal.submitting || proposeModal.pickerItems.length === 0}
                  className="flex-[2] bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {proposeModal.submitting ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
