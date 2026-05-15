'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  fetchUserAlbums,
  fetchTradeMatches,
  fetchTrades,
  createTrade,
  albumDisplayName,
  type UserAlbum,
  type TradeMatch,
  type TradeSummary,
} from '@/lib/api';

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
  offerCodes: string;
  wantCodes: string;
  submitting: boolean;
  error: string | null;
}

export default function TradePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [tab, setTab] = useState<Tab>('find');

  // Find Trades state
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  // My Trades state
  const [trades, setTrades] = useState<TradeSummary[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  // Propose modal
  const [proposeModal, setProposeModal] = useState<ProposeModalState | null>(null);

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
            setSelectedAlbumId(defaultAlbum.id);
          }
        }
      } catch {
        // non-fatal — user can still use the page
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

  async function handleFindMatches() {
    if (!token || !selectedAlbumId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    setMatches([]);
    try {
      const data = await fetchTradeMatches(selectedAlbumId, token);
      setMatches(data);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to find matches');
    } finally {
      setMatchesLoading(false);
    }
  }

  function openProposeModal(match: TradeMatch) {
    setProposeModal({
      match,
      offerCodes: match.you_have.join(', '),
      wantCodes: match.they_have.join(', '),
      submitting: false,
      error: null,
    });
  }

  async function handleSendTradeRequest() {
    if (!proposeModal || !token || !user) return;

    // Parse comma-separated album codes and create minimal trade items
    const offerCodes = proposeModal.offerCodes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const wantCodes = proposeModal.wantCodes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (offerCodes.length === 0 && wantCodes.length === 0) {
      setProposeModal((prev) =>
        prev ? { ...prev, error: 'Add at least one sticker to offer or want.' } : prev,
      );
      return;
    }

    const items: { albumCode: string; direction: 'offer' | 'want'; quantity: number }[] = [
      ...offerCodes.map((code) => ({ albumCode: code, direction: 'offer' as const, quantity: 1 })),
      ...wantCodes.map((code) => ({ albumCode: code, direction: 'want' as const, quantity: 1 })),
    ];

    setProposeModal((prev) => prev ? { ...prev, submitting: true, error: null } : prev);

    try {
      const result = await createTrade(
        { recipientId: proposeModal.match.user_id, items },
        token,
      );
      setProposeModal(null);
      router.push(`/trade/${result.id}`);
    } catch (err) {
      setProposeModal((prev) =>
        prev
          ? { ...prev, submitting: false, error: err instanceof Error ? err.message : 'Failed to send trade request' }
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
          onClick={() => setTab('find')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'find'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Find Trades
        </button>
        <button
          onClick={() => setTab('my')}
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
                  {albums.length === 0 && (
                    <option value="">No albums found</option>
                  )}
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
              No matches found yet. Click "Find Matches" to search.
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
                onClick={() => setTab('find')}
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
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
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
      {proposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Propose Trade</h2>
            <p className="text-sm text-gray-500 mb-4">
              With{' '}
              <span className="font-medium text-gray-700">
                {proposeModal.match.display_name ?? proposeModal.match.username}
              </span>{' '}
              (@{proposeModal.match.username})
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Stickers you will offer (album codes, comma-separated)
                </label>
                <textarea
                  value={proposeModal.offerCodes}
                  onChange={(e) =>
                    setProposeModal((prev) => prev ? { ...prev, offerCodes: e.target.value } : prev)
                  }
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="e.g. FIFA001, FIFA002, FIFA003"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Pre-filled with stickers you have that they need.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Stickers you want (album codes, comma-separated)
                </label>
                <textarea
                  value={proposeModal.wantCodes}
                  onChange={(e) =>
                    setProposeModal((prev) => prev ? { ...prev, wantCodes: e.target.value } : prev)
                  }
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="e.g. FIFA010, FIFA011"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Pre-filled with stickers they have that you need.
                </p>
              </div>

              {proposeModal.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {proposeModal.error}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSendTradeRequest}
                disabled={proposeModal.submitting}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {proposeModal.submitting ? 'Sending...' : 'Send Request'}
              </button>
              <button
                onClick={() => setProposeModal(null)}
                disabled={proposeModal.submitting}
                className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
