'use client';

import { useMemo, useState } from 'react';
import { isLiveTradeRow, type LiveTradeHistorySummary, type LiveTradeStickerRef, type TradeHistoryItem, type TradeSummary, type TradeSummaryItem } from '@/lib/api';

// Renders "My Trades" as cards on mobile and a sortable table on md+. The list
// is heterogeneous: classic trade requests AND completion rows (in-person Live
// Room trades + off-platform third-party trades) are merged into one feed
// (sorted by updatedAt desc) and dispatched per-row on the `kind` discriminator.
// Completion rows have no detail page — they expand in place to reveal the full
// gave/received piles.

const STATUS_BADGE: Record<TradeSummary['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]' },
  accepted:  { label: 'Accepted',  className: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]' },
  declined:  { label: 'Declined',  className: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]' },
  cancelled: { label: 'Cancelled', className: 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]' },
  completed: { label: 'Completed', className: 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]' },
  expired:   { label: 'Expired',   className: 'border border-[var(--cromo-border)] text-[var(--cromo-fg-subtle)]' },
};

// Stable ordering for status so "active" trades cluster at the top when
// the user sorts by status. Pending and accepted are the ones the user
// usually wants to look at first.
const STATUS_ORDER: Record<TradeSummary['status'], number> = {
  pending: 0,
  accepted: 1,
  completed: 2,
  declined: 3,
  cancelled: 4,
  expired: 5,
};

const OPEN_STATUSES = new Set<TradeSummary['status']>(['pending', 'accepted']);

function effectiveStatus(item: TradeHistoryItem): TradeSummary['status'] {
  return isLiveTradeRow(item) ? item.status : item.status;
}

function closedAt(item: TradeHistoryItem): string | null {
  if (isLiveTradeRow(item)) {
    return item.undoneAt ?? item.completedAt;
  }
  return item.completedAt ?? item.cancelledAt ?? null;
}

function openedAt(item: TradeHistoryItem): string {
  // Live trades have no "opened" — they're recorded as a single completion
  // event. We surface completedAt in the "Opened" column so the date columns
  // still line up across both kinds.
  return isLiveTradeRow(item) ? item.completedAt : item.createdAt;
}

function completionCounterparty(item: LiveTradeHistorySummary): string {
  return item.guestLabel ?? (item.source === 'third_party' ? 'Off-platform partner' : 'Guest');
}

function counterpartyLabel(item: TradeHistoryItem, myUserId: string): string {
  if (isLiveTradeRow(item)) return completionCounterparty(item);
  return item.requesterId === myUserId ? item.recipientUsername : item.requesterUsername;
}

type SortKey = 'created' | 'closed' | 'status' | 'other';
type SortDir = 'asc' | 'desc';

interface Props {
  trades: TradeHistoryItem[];
  myUserId: string;
  /** Called only for classic trade requests — live trades have no detail page. */
  onOpen: (tradeId: string) => void;
}

export default function TradesList({ trades, myUserId, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [closedOpen, setClosedOpen] = useState(false);

  const { openTrades, closedTrades } = useMemo(() => {
    const cmpFn = (a: TradeHistoryItem, b: TradeHistoryItem) => {
      let cmp = 0;
      if (sortKey === 'created') {
        cmp = Date.parse(openedAt(a)) - Date.parse(openedAt(b));
      } else if (sortKey === 'closed') {
        // Trades with no closing date sort to the end regardless of dir.
        const aC = closedAt(a);
        const bC = closedAt(b);
        if (aC === null && bC === null) cmp = 0;
        else if (aC === null) return 1;
        else if (bC === null) return -1;
        else cmp = Date.parse(aC) - Date.parse(bC);
      } else if (sortKey === 'status') {
        cmp = STATUS_ORDER[effectiveStatus(a)] - STATUS_ORDER[effectiveStatus(b)];
      } else if (sortKey === 'other') {
        cmp = counterpartyLabel(a, myUserId).localeCompare(counterpartyLabel(b, myUserId));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    };
    const open: TradeHistoryItem[] = [];
    const closed: TradeHistoryItem[] = [];
    for (const t of trades) {
      // Live trades are always closed by definition (they're inserted at
      // completion time). Only classic requests can be in an open state.
      (!isLiveTradeRow(t) && OPEN_STATUSES.has(t.status) ? open : closed).push(t);
    }
    open.sort(cmpFn);
    closed.sort(cmpFn);
    return { openTrades: open, closedTrades: closed };
  }, [trades, sortKey, sortDir, myUserId]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Dates default to newest-first; other keys default to A→Z.
      setSortDir(key === 'created' || key === 'closed' ? 'desc' : 'asc');
    }
  }

  return (
    <>
      {/* Mobile / sm: card stack. */}
      <div className="md:hidden space-y-4">
        <MobileGroup
          trades={openTrades}
          myUserId={myUserId}
          onOpen={onOpen}
          emptyLabel="No trades in progress."
        />
        {closedTrades.length > 0 && (
          <div>
            <button
              onClick={() => setClosedOpen((v) => !v)}
              aria-expanded={closedOpen}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--cromo-fg-muted)] rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              <span>
                Closed trades <span className="tabular-nums">({closedTrades.length})</span>
              </span>
              <span className="text-[var(--cromo-fg-subtle)]">{closedOpen ? '▾' : '▸'}</span>
            </button>
            {closedOpen && (
              <div className="mt-2 space-y-2">
                <MobileGroup trades={closedTrades} myUserId={myUserId} onOpen={onOpen} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* md+: sortable table. The header buttons toggle sort; the active key
          shows a direction arrow. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--cromo-border)]">
              <SortHeader label="With" active={sortKey === 'other'} dir={sortDir} onClick={() => toggleSort('other')} />
              <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
              <SortHeader label="Opened" align="right" active={sortKey === 'created'} dir={sortDir} onClick={() => toggleSort('created')} />
              <SortHeader label="Closed" align="right" active={sortKey === 'closed'} dir={sortDir} onClick={() => toggleSort('closed')} />
            </tr>
          </thead>
          <tbody>
            {openTrades.map((trade) => (
              <DesktopRow key={rowKey(trade)} trade={trade} myUserId={myUserId} onOpen={onOpen} />
            ))}
            {openTrades.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--cromo-fg-subtle)] italic">
                  No trades in progress.
                </td>
              </tr>
            )}
            {closedTrades.length > 0 && (
              <tr>
                <td colSpan={4} className="px-0 pt-3 pb-1">
                  <button
                    onClick={() => setClosedOpen((v) => !v)}
                    aria-expanded={closedOpen}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--cromo-fg-muted)] rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                  >
                    <span>
                      Closed trades <span className="tabular-nums">({closedTrades.length})</span>
                    </span>
                    <span className="text-[var(--cromo-fg-subtle)]">{closedOpen ? '▾' : '▸'}</span>
                  </button>
                </td>
              </tr>
            )}
            {closedOpen &&
              closedTrades.map((trade) => (
                <DesktopRow key={rowKey(trade)} trade={trade} myUserId={myUserId} onOpen={onOpen} />
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Composite key — live and request rows can share a UUID space in theory,
// even though in practice they don't. Prefixing with the kind is cheap insurance
// for React's reconciliation.
function rowKey(item: TradeHistoryItem): string {
  return `${isLiveTradeRow(item) ? 'live' : 'req'}:${item.id}`;
}

function DesktopRow({
  trade, myUserId, onOpen,
}: { trade: TradeHistoryItem; myUserId: string; onOpen: (id: string) => void }) {
  if (isLiveTradeRow(trade)) return <LiveDesktopRow trade={trade} />;
  return <RequestDesktopRow trade={trade} myUserId={myUserId} onOpen={onOpen} />;
}

function RequestDesktopRow({
  trade, myUserId, onOpen,
}: { trade: TradeSummary; myUserId: string; onOpen: (id: string) => void }) {
  const badge = STATUS_BADGE[trade.status];
  const isRequester = trade.requesterId === myUserId;
  const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
  const closed = closedAt(trade);
  return (
    <tr
      onClick={() => onOpen(trade.id)}
      className="border-b border-[var(--cromo-border)] hover:bg-[var(--cromo-accent-soft)] cursor-pointer transition-colors"
    >
      <td className="px-3 py-2 text-[var(--cromo-fg)] font-medium">
        <div>@{otherUser}</div>
        <RequestSummaryLine trade={trade} isRequester={isRequester} />
      </td>
      <td className="px-3 py-2 align-top">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums align-top">
        {new Date(trade.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums align-top">
        {closed ? new Date(closed).toLocaleDateString() : '—'}
      </td>
    </tr>
  );
}

function LiveDesktopRow({ trade }: { trade: LiveTradeHistorySummary }) {
  const badge = STATUS_BADGE[trade.status];
  const [expanded, setExpanded] = useState(false);
  const hasStickers = trade.hostGave.length > 0 || trade.hostReceived.length > 0;
  return (
    <>
      <tr
        onClick={() => hasStickers && setExpanded((v) => !v)}
        aria-expanded={hasStickers ? expanded : undefined}
        className={`border-b border-[var(--cromo-border)] transition-colors ${
          hasStickers ? 'hover:bg-[var(--cromo-accent-soft)] cursor-pointer' : ''
        }`}
      >
        <td className="px-3 py-2 text-[var(--cromo-fg)] font-medium">
          <div className="flex items-center gap-1.5">
            {hasStickers && (
              <span className="text-[var(--cromo-fg-subtle)] text-xs w-3">{expanded ? '▾' : '▸'}</span>
            )}
            <span>{completionCounterparty(trade)}</span>
            <SourceBadge source={trade.source} />
          </div>
          {/* Collapsed: 4-code preview. Expanded: the full piles below replace it. */}
          {!expanded && <LiveSummaryLine trade={trade} />}
        </td>
        <td className="px-3 py-2 align-top">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums align-top">
          {new Date(trade.completedAt).toLocaleDateString()}
        </td>
        <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums align-top">
          {trade.undoneAt ? new Date(trade.undoneAt).toLocaleDateString() : new Date(trade.completedAt).toLocaleDateString()}
        </td>
      </tr>
      {expanded && hasStickers && (
        <tr className="border-b border-[var(--cromo-border)] bg-[var(--cromo-surface-2)]/40">
          <td colSpan={4} className="px-3 py-3">
            <CompletionDetail trade={trade} />
          </td>
        </tr>
      )}
    </>
  );
}

function MobileGroup({
  trades,
  myUserId,
  onOpen,
  emptyLabel,
}: {
  trades: TradeHistoryItem[];
  myUserId: string;
  onOpen: (tradeId: string) => void;
  emptyLabel?: string;
}) {
  if (trades.length === 0) {
    return emptyLabel ? (
      <p className="text-xs text-[var(--cromo-fg-subtle)] italic px-1">{emptyLabel}</p>
    ) : null;
  }
  return (
    <div className="space-y-2">
      {trades.map((trade) =>
        isLiveTradeRow(trade)
          ? <LiveMobileCard key={rowKey(trade)} trade={trade} />
          : <RequestMobileCard key={rowKey(trade)} trade={trade} myUserId={myUserId} onOpen={onOpen} />
      )}
    </div>
  );
}

function RequestMobileCard({
  trade, myUserId, onOpen,
}: { trade: TradeSummary; myUserId: string; onOpen: (id: string) => void }) {
  const badge = STATUS_BADGE[trade.status];
  const isRequester = trade.requesterId === myUserId;
  const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
  const closed = closedAt(trade);
  return (
    <button
      onClick={() => onOpen(trade.id)}
      className="w-full text-left rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 hover:border-[var(--cromo-accent)]/30 hover:bg-[var(--cromo-accent-soft)] transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--cromo-fg)] truncate">@{otherUser}</div>
          <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5">
            Opened {new Date(trade.createdAt).toLocaleDateString()}
            {closed && <> · Closed {new Date(closed).toLocaleDateString()}</>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <RequestSummaryLine trade={trade} isRequester={isRequester} />
    </button>
  );
}

function LiveMobileCard({ trade }: { trade: LiveTradeHistorySummary }) {
  const badge = STATUS_BADGE[trade.status];
  const [expanded, setExpanded] = useState(false);
  const hasStickers = trade.hostGave.length > 0 || trade.hostReceived.length > 0;
  return (
    <div className="w-full rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
      <button
        type="button"
        onClick={() => hasStickers && setExpanded((v) => !v)}
        aria-expanded={hasStickers ? expanded : undefined}
        disabled={!hasStickers}
        className={`w-full text-left ${hasStickers ? '' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--cromo-fg)] truncate flex items-center gap-1.5">
              {hasStickers && (
                <span className="text-[var(--cromo-fg-subtle)] text-xs">{expanded ? '▾' : '▸'}</span>
              )}
              <span className="truncate">{completionCounterparty(trade)}</span>
              <SourceBadge source={trade.source} />
            </div>
            <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5">
              {new Date(trade.completedAt).toLocaleDateString()}
              {trade.undoneAt && <> · Undone {new Date(trade.undoneAt).toLocaleDateString()}</>}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <div className="mt-2.5">
          {/* Collapsed: 4-code preview. Expanded: the full piles below replace it. */}
          {!expanded && <LiveSummaryLine trade={trade} />}
        </div>
      </button>
      {expanded && hasStickers && (
        <div className="mt-3 pt-3 border-t border-[var(--cromo-border)]">
          <CompletionDetail trade={trade} />
        </div>
      )}
    </div>
  );
}

// Badge distinguishing the two completion flows. A third-party trade is one the
// user logged after trading off-platform — labelling it "Live" (as every
// completion row used to) was the bug this fixes.
function SourceBadge({ source }: { source: LiveTradeHistorySummary['source'] }) {
  if (source === 'third_party') {
    return (
      <span
        title="Off-platform trade you logged manually"
        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]"
      >
        Third-party
      </span>
    );
  }
  return (
    <span
      title="In-person trade with a non-registered visitor"
      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]"
    >
      Live
    </span>
  );
}

// Full gave/received piles for an expanded completion row — every sticker, not
// the 4-code preview in the collapsed summary.
function CompletionDetail({ trade }: { trade: LiveTradeHistorySummary }) {
  const gave = trade.hostGave;
  const got = trade.hostReceived;
  if (gave.length === 0 && got.length === 0) {
    return <p className="text-xs italic text-[var(--cromo-fg-subtle)]">Empty trade.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <RefColumn label="Gave" refs={gave} />
      <RefColumn label="Got" refs={got} />
    </div>
  );
}

function RefColumn({
  label, refs,
}: { label: string; refs: LiveTradeStickerRef[] }) {
  const total = refs.reduce((s, r) => s + r.quantity, 0);
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-subtle)] mb-1.5">
        {label} <span className="tabular-nums">×{total}</span>
      </div>
      {refs.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] italic">Nothing.</p>
      ) : (
        <ul className="space-y-0.5">
          {refs.map((r) => (
            <li key={r.stickerVariantId} className="text-xs text-[var(--cromo-fg-muted)] flex items-baseline gap-1.5">
              <span className="font-mono text-[var(--cromo-fg)]">{r.albumCode}</span>
              <span className="truncate">{fullRefLabel(r)}</span>
              {r.quantity > 1 && <span className="tabular-nums shrink-0">×{r.quantity}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "Vinicius Jr. (Red)" — player plus a variant suffix, dropping the two base
// tokens (their label is redundant on a sticker line). Mirrors refLabel in the
// live-room page.
function fullRefLabel(ref: LiveTradeStickerRef): string {
  const player = ref.playerName ?? 'Unknown';
  const variant =
    ref.variantLabel &&
    ref.variantToken !== 'base_borderless' &&
    ref.variantToken !== 'base_border'
      ? ` (${ref.variantLabel})`
      : '';
  return `${player}${variant}`;
}

// Split a request trade's items into gave/got piles from the *viewer's*
// perspective. Item direction is stored from the requester's side ('offer' =
// requester gives, 'want' = requester receives), so a recipient sees it
// flipped.
function viewerPiles(
  items: TradeSummaryItem[],
  isRequester: boolean,
): { gave: TradeSummaryItem[]; got: TradeSummaryItem[] } {
  const giveDir = isRequester ? 'offer' : 'want';
  return {
    gave: items.filter((i) => i.direction === giveDir),
    got: items.filter((i) => i.direction !== giveDir),
  };
}

// Renders the stickers on a request trade so every kind of trade in My Trades
// shows what's involved. Past-tense "Gave/Got" only fits a settled trade; an
// in-progress one is still a proposal, so it reads "You give/You get".
function RequestSummaryLine({ trade, isRequester }: { trade: TradeSummary; isRequester: boolean }) {
  const items = trade.items ?? [];
  if (items.length === 0) return null;
  const { gave, got } = viewerPiles(items, isRequester);
  const settled = trade.status === 'completed';
  return (
    <PileSummary
      gave={gave}
      got={got}
      giveLabel={settled ? 'Gave' : 'You give'}
      gotLabel={settled ? 'Got' : 'You get'}
    />
  );
}

function PileSummary({
  gave,
  got,
  giveLabel = 'Gave',
  gotLabel = 'Got',
}: {
  gave: { albumCode: string; quantity: number }[];
  got: { albumCode: string; quantity: number }[];
  giveLabel?: string;
  gotLabel?: string;
}) {
  const gaveCount = gave.reduce((s, r) => s + r.quantity, 0);
  const gotCount = got.reduce((s, r) => s + r.quantity, 0);
  const previewLimit = 4;
  const gavePreview = gave.slice(0, previewLimit).map((r) => r.albumCode).join(', ');
  const gotPreview = got.slice(0, previewLimit).map((r) => r.albumCode).join(', ');
  const gaveExtra = gave.length > previewLimit ? ` +${gave.length - previewLimit} more` : '';
  const gotExtra = got.length > previewLimit ? ` +${got.length - previewLimit} more` : '';
  if (gaveCount === 0 && gotCount === 0) return null;
  return (
    <div className="text-xs text-[var(--cromo-fg-muted)] mt-0.5 space-y-0.5">
      {gaveCount > 0 && (
        <div>
          <span className="text-[var(--cromo-fg-subtle)]">{giveLabel}</span>{' '}
          <span className="tabular-nums">×{gaveCount}</span>
          <span className="font-mono ml-1.5">{gavePreview}{gaveExtra}</span>
        </div>
      )}
      {gotCount > 0 && (
        <div>
          <span className="text-[var(--cromo-fg-subtle)]">{gotLabel}</span>{' '}
          <span className="tabular-nums">×{gotCount}</span>
          <span className="font-mono ml-1.5">{gotPreview}{gotExtra}</span>
        </div>
      )}
    </div>
  );
}

function LiveSummaryLine({ trade }: { trade: LiveTradeHistorySummary }) {
  const empty = trade.hostGave.length === 0 && trade.hostReceived.length === 0;
  if (empty) {
    return (
      <div className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
        <span className="italic">Empty trade.</span>
      </div>
    );
  }
  return <PileSummary gave={trade.hostGave} got={trade.hostReceived} />;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active?: boolean;
  dir?: SortDir;
  onClick?: () => void;
  align?: 'left' | 'right';
}) {
  const clickable = !!onClick;
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} text-[11px] font-semibold uppercase tracking-widest text-[var(--cromo-fg-subtle)]`}>
      {clickable ? (
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-1 ${active ? 'text-[var(--cromo-fg)]' : 'hover:text-[var(--cromo-fg-muted)]'}`}
        >
          {label}
          {active && <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span>}
        </button>
      ) : (
        <span>{label}</span>
      )}
    </th>
  );
}
