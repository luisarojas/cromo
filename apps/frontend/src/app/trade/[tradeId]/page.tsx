'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  fetchTrade,
  acceptTrade,
  declineTrade,
  cancelTrade,
  completeTrade,
  counterTrade,
  editTrade,
  sendTradeMessage,
  fetchCollection,
  type TradeDetail,
  type TradeMessage,
  type TradeItemDetail,
  type CollectionItem,
} from '@/lib/api';
import TradeStickerPicker, { type TradePickerItem } from '../components/TradeStickerPicker';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function formatCash(cents: number): string {
  return `CA$${(cents / 100).toFixed(2)}`;
}

const STATUS_BADGE: Record<TradeDetail['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', className: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expired', className: 'bg-gray-100 text-gray-700' },
};

function ItemCard({ item }: { item: TradeItemDetail }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
      <div className="font-medium text-gray-800">{item.albumCode}</div>
      <div className="text-xs text-gray-500 mt-0.5 space-x-1.5">
        {item.playerName && <span>{item.playerName}</span>}
        {item.teamName && <span>&middot; {item.teamName}</span>}
        <span>&middot; {item.variantType}</span>
        {item.quantity > 1 && (
          <span className="font-medium text-gray-700">&times;{item.quantity}</span>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, isMe }: { msg: TradeMessage; isMe: boolean }) {
  if (msg.isSystem) {
    return (
      <div className="py-0.5 text-center">
        <span className="text-[10px] text-gray-400 whitespace-pre-line leading-snug">{msg.body}</span>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
      <div className="text-xs text-gray-400">
        {msg.senderDisplayName ?? msg.senderUsername} &middot;{' '}
        {new Date(msg.sentAt).toLocaleString()}
      </div>
      <div
        className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
          isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
        }`}
      >
        {msg.body}
      </div>
    </div>
  );
}

export default function TradeDetailPage() {
  const params = useParams();
  const tradeId = typeof params.tradeId === 'string' ? params.tradeId : (params.tradeId?.[0] ?? '');
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Message compose
  const [msgBody, setMsgBody] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Counter form
  const [showCounter, setShowCounter] = useState(false);
  const [counterItems, setCounterItems] = useState<TradePickerItem[]>([]);
  const [counterOfferCash, setCounterOfferCash] = useState(0);
  const [counterWantCash, setCounterWantCash] = useState(0);
  const [counterError, setCounterError] = useState<string | null>(null);
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const [counterOfferItems, setCounterOfferItems] = useState<CollectionItem[]>([]);
  const [counterOfferItemsLoading, setCounterOfferItemsLoading] = useState(false);
  const counterOfferItemsLoadedRef = useRef(false);

  // Edit counter-offer form
  const [showEdit, setShowEdit] = useState(false);
  const [editItems, setEditItems] = useState<TradePickerItem[]>([]);
  const [editOfferCash, setEditOfferCash] = useState(0);
  const [editWantCash, setEditWantCash] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editOfferItems, setEditOfferItems] = useState<CollectionItem[]>([]);
  const [editOfferItemsLoading, setEditOfferItemsLoading] = useState(false);
  const editOfferItemsLoadedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function load() {
      if (!token) return;
      try {
        const data = await fetchTrade(tradeId, token);
        if (!cancelled) {
          setTrade(data);
          setMessages(data.messages);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load trade');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router, tradeId]);

  // SSE for real-time updates
  useEffect(() => {
    if (!token || !tradeId) return;

    const es = new EventSource(
      `${BASE_URL}/api/v1/trade/requests/${tradeId}/stream?token=${encodeURIComponent(token)}`,
    );

    es.addEventListener('new_message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as TradeMessage;
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch {}
    });

    es.addEventListener('status_changed', (ev) => {
      try {
        const payload = JSON.parse(ev.data) as { status: TradeDetail['status'] };
        setTrade((prev) => prev ? { ...prev, status: payload.status } : prev);
      } catch {}
    });

    es.addEventListener('confirmation_updated', (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          requesterCompletedAt: string | null;
          recipientCompletedAt: string | null;
        };
        setTrade((prev) => prev ? {
          ...prev,
          requesterCompletedAt: payload.requesterCompletedAt,
          recipientCompletedAt: payload.recipientCompletedAt,
        } : prev);
      } catch {}
    });

    return () => {
      es.close();
    };
  }, [token, tradeId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load user's collection once when counter form first opens
  useEffect(() => {
    if (!showCounter || !token || !user || counterOfferItemsLoadedRef.current) return;
    counterOfferItemsLoadedRef.current = true;
    setCounterOfferItemsLoading(true);
    fetchCollection(user.id, { limit: 1000 }, token)
      .then((result) => setCounterOfferItems(result.items))
      .catch(() => {})
      .finally(() => setCounterOfferItemsLoading(false));
  }, [showCounter, token, user]);

  // Load user's collection once when edit form first opens
  useEffect(() => {
    if (!showEdit || !token || !user || editOfferItemsLoadedRef.current) return;
    editOfferItemsLoadedRef.current = true;
    setEditOfferItemsLoading(true);
    fetchCollection(user.id, { limit: 1000 }, token)
      .then((result) => setEditOfferItems(result.items))
      .catch(() => {})
      .finally(() => setEditOfferItemsLoading(false));
  }, [showEdit, token, user]);

  async function runAction(action: () => Promise<void>, onSuccess?: () => void) {
    if (!token) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await action();
      // Refresh trade state
      const updated = await fetchTrade(tradeId, token);
      setTrade(updated);
      setMessages(updated.messages);
      onSuccess?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAccept() {
    if (!token) return;
    await runAction(() => acceptTrade(tradeId, token));
  }

  async function handleDecline() {
    if (!token) return;
    await runAction(() => declineTrade(tradeId, token));
  }

  async function handleCancel() {
    if (!token) return;
    await runAction(() => cancelTrade(tradeId, token));
  }

  async function handleComplete() {
    if (!token) return;
    await runAction(() => completeTrade(tradeId, token));
  }

  async function handleCounter() {
    if (!token || !trade) return;

    const hasOffer = counterItems.some((i) => i.direction === 'offer') || counterOfferCash > 0;
    const hasWant = counterItems.some((i) => i.direction === 'want') || counterWantCash > 0;

    if (!hasOffer || !hasWant) {
      setCounterError('Add at least one sticker or cash amount to offer and to request.');
      return;
    }

    setCounterSubmitting(true);
    setCounterError(null);
    try {
      await counterTrade(
        tradeId,
        {
          items: counterItems.map((i) => ({ variantId: i.variantId, direction: i.direction, quantity: i.quantity })),
          offerCash: counterOfferCash,
          wantCash: counterWantCash,
        },
        token,
      );
      const updated = await fetchTrade(tradeId, token);
      setTrade(updated);
      setMessages(updated.messages);
      setShowCounter(false);
      setCounterItems([]);
      setCounterOfferCash(0);
      setCounterWantCash(0);
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : 'Failed to submit counter offer');
    } finally {
      setCounterSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!token || !trade) return;

    const hasOffer = editItems.some((i) => i.direction === 'offer') || editOfferCash > 0;
    const hasWant = editItems.some((i) => i.direction === 'want') || editWantCash > 0;

    if (!hasOffer || !hasWant) {
      setEditError('Add at least one sticker or cash amount to offer and to request.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    try {
      await editTrade(
        tradeId,
        {
          items: editItems.map((i) => ({ variantId: i.variantId, direction: i.direction, quantity: i.quantity })),
          offerCash: editOfferCash,
          wantCash: editWantCash,
        },
        token,
      );
      const updated = await fetchTrade(tradeId, token);
      setTrade(updated);
      setMessages(updated.messages);
      setShowEdit(false);
      setEditItems([]);
      setEditOfferCash(0);
      setEditWantCash(0);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update counter offer');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSendMessage() {
    if (!token || !msgBody.trim()) return;
    setSendingMsg(true);
    const body = msgBody.trim();
    setMsgBody('');
    // Optimistic append
    const optimisticMsg: TradeMessage = {
      id: `optimistic-${Date.now()}`,
      tradeId: tradeId,
      senderId: user?.id ?? '',
      senderUsername: user?.username ?? '',
      senderDisplayName: user?.displayName ?? null,
      body,
      sentAt: new Date().toISOString(),
      isSystem: false,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      const sent = await sendTradeMessage(tradeId, body, token);
      // Replace optimistic message with real one; also remove any SSE-added copy
      // that arrived before this response was processed (race condition).
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimisticMsg.id && m.id !== sent.id);
        return [...without, sent];
      });
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setMsgBody(body);
    } finally {
      setSendingMsg(false);
    }
  }

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
          <div className="h-40 rounded-xl bg-gray-200 animate-pulse" />
          <div className="h-60 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error ?? 'Trade not found.'}
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[trade.status];
  const isRequester = trade.requesterId === user?.id;
  const isRecipient = trade.recipientId === user?.id;

  const offeredItems = trade.items.filter((i) => i.direction === 'offer');
  const wantedItems = trade.items.filter((i) => i.direction === 'want');

  const canAcceptDecline = isRecipient && trade.status === 'pending';
  const canCancel =
    (isRequester && trade.status === 'pending') ||
    ((isRequester || isRecipient) && trade.status === 'accepted');
  const iHaveConfirmedComplete = trade.status === 'accepted' && (
    (isRequester && trade.requesterCompletedAt !== null) ||
    (isRecipient && trade.recipientCompletedAt !== null)
  );
  const canComplete = (isRequester || isRecipient) && trade.status === 'accepted' && !iHaveConfirmedComplete;
  const canCounter = isRecipient && trade.status === 'pending';
  const canEdit = isRequester && trade.status === 'pending' && trade.counterCount > 0;
  const isTerminal = ['completed', 'declined', 'cancelled', 'expired'].includes(trade.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push('/trade')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Trades
        </button>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Trade Details</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Participants */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-5">
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-0.5">Requester</div>
            <div className="font-medium text-gray-800">@{trade.requesterUsername}</div>
          </div>
          <div className="text-gray-400 self-center">&harr;</div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-0.5">Recipient</div>
            <div className="font-medium text-gray-800">@{trade.recipientUsername}</div>
          </div>
          <div className="ml-auto text-xs text-gray-400 self-center">
            Created {new Date(trade.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Trade items */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Trade Items</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Offered
            </h3>
            {offeredItems.length === 0 && trade.offerCash === 0 ? (
              <p className="text-xs text-gray-400">Nothing offered</p>
            ) : (
              <div className="space-y-2">
                {trade.offerCash > 0 && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                    {formatCash(trade.offerCash)} cash
                  </div>
                )}
                {offeredItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Wanted
            </h3>
            {wantedItems.length === 0 && trade.wantCash === 0 ? (
              <p className="text-xs text-gray-400">Nothing requested</p>
            ) : (
              <div className="space-y-2">
                {trade.wantCash > 0 && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    {formatCash(trade.wantCash)} cash
                  </div>
                )}
                {wantedItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {!isTerminal && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions</h2>

          {actionError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-3">
              {actionError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canAcceptDecline && (
              <>
                <button
                  onClick={handleAccept}
                  disabled={actionLoading}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={handleDecline}
                  disabled={actionLoading}
                  className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Decline
                </button>
              </>
            )}
            {canCounter && (
              <button
                onClick={() => setShowCounter((v) => !v)}
                disabled={actionLoading}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Counter Offer
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowEdit((v) => !v)}
                disabled={actionLoading}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Edit Offer
              </button>
            )}
            {canComplete && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Mark Complete
              </button>
            )}
            {iHaveConfirmedComplete && (
              <span className="rounded-md px-4 py-2 text-sm font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                Waiting for other participant to confirm
              </span>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Cancel Trade
              </button>
            )}
          </div>

          {/* Counter form */}
          {showCounter && token && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Submit Counter Offer</h3>
              <TradeStickerPicker
                key="counter"
                offerItems={counterOfferItems}
                offerItemsLoading={counterOfferItemsLoading}
                suggestedOfferCodes={wantedItems.map((i) => i.albumCode)}
                suggestedWantCodes={offeredItems.map((i) => i.albumCode)}
                suggestedWantVariantIds={offeredItems.map((i) => i.stickerVariantId)}
                initialOfferVariants={wantedItems.map((i) => ({ variantId: i.stickerVariantId, quantity: i.quantity }))}
                initialWantVariantIds={offeredItems.map((i) => i.stickerVariantId)}
                initialOfferCash={trade.wantCash}
                initialWantCash={trade.offerCash}
                token={token}
                partnerName={isRequester ? trade.recipientUsername : trade.requesterUsername}
                onChange={(items, offerCash, wantCash) => {
                  setCounterItems(items);
                  setCounterOfferCash(offerCash);
                  setCounterWantCash(wantCash);
                }}
              />
              {counterError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {counterError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCounter}
                  disabled={counterSubmitting}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {counterSubmitting ? 'Submitting...' : 'Submit Counter'}
                </button>
                <button
                  onClick={() => { setShowCounter(false); setCounterItems([]); setCounterOfferCash(0); setCounterWantCash(0); }}
                  disabled={counterSubmitting}
                  className="bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit counter-offer form */}
          {showEdit && token && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Edit Counter Offer</h3>
              <TradeStickerPicker
                key="edit"
                offerItems={editOfferItems}
                offerItemsLoading={editOfferItemsLoading}
                suggestedOfferCodes={offeredItems.map((i) => i.albumCode)}
                suggestedWantCodes={wantedItems.map((i) => i.albumCode)}
                suggestedWantVariantIds={wantedItems.map((i) => i.stickerVariantId)}
                initialOfferVariants={offeredItems.map((i) => ({ variantId: i.stickerVariantId, quantity: i.quantity }))}
                initialWantVariantIds={wantedItems.map((i) => i.stickerVariantId)}
                initialOfferCash={trade.offerCash}
                initialWantCash={trade.wantCash}
                token={token}
                partnerName={trade.recipientUsername}
                onChange={(items, offerCash, wantCash) => {
                  setEditItems(items);
                  setEditOfferCash(offerCash);
                  setEditWantCash(wantCash);
                }}
              />
              {editError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {editError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  disabled={editSubmitting}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setShowEdit(false); setEditItems([]); setEditOfferCash(0); setEditWantCash(0); }}
                  disabled={editSubmitting}
                  className="bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Messages</h2>

        <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No messages yet.</p>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === user?.id} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {!isTerminal && (
          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={2}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={sendingMsg || !msgBody.trim()}
              className="bg-blue-600 text-white hover:bg-blue-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed self-end transition-colors"
            >
              Send
            </button>
          </div>
        )}

        {isTerminal && (
          <p className="text-xs text-gray-400 text-center pt-3 border-t border-gray-100">
            This trade is {trade.status}. Messaging is disabled.
          </p>
        )}
      </div>
    </div>
  );
}
