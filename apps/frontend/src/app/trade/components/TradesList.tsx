'use client';

import { useMemo, useState } from 'react';
import { isLiveTradeRow, type LiveTradeHistorySummary, type TradeHistoryItem, type TradeSummary } from '@/lib/api';

// Renders "My Trades" as cards on mobile and a sortable table on md+. The list
// is heterogeneous: classic trade requests AND live in-person trades are
// merged into one feed (sorted by updatedAt desc) and dispatched per-row on
// the `kind` discriminator. Live rows are display-only — there is no detail
// page; the gave/received piles are shown inline.

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

function counterpartyLabel(item: TradeHistoryItem, myUserId: string): string {
  if (isLiveTradeRow(item)) return item.guestLabel ?? 'Guest';
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
      <td className="px-3 py-2 text-[var(--cromo-fg)] font-medium">@{otherUser}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">
        {new Date(trade.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">
        {closed ? new Date(closed).toLocaleDateString() : '—'}
      </td>
    </tr>
  );
}

function LiveDesktopRow({ trade }: { trade: LiveTradeHistorySummary }) {
  const badge = STATUS_BADGE[trade.status];
  return (
    <tr className="border-b border-[var(--cromo-border)]">
      <td className="px-3 py-2 text-[var(--cromo-fg)] font-medium">
        <div className="flex items-center gap-1.5">
          <span>{trade.guestLabel ?? 'Guest'}</span>
          <LiveBadge />
        </div>
        <LiveSummaryLine trade={trade} />
      </td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">
        {new Date(trade.completedAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">
        {trade.undoneAt ? new Date(trade.undoneAt).toLocaleDateString() : new Date(trade.completedAt).toLocaleDateString()}
      </td>
    </tr>
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
    </button>
  );
}

function LiveMobileCard({ trade }: { trade: LiveTradeHistorySummary }) {
  const badge = STATUS_BADGE[trade.status];
  return (
    <div className="w-full rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--cromo-fg)] truncate flex items-center gap-1.5">
            <span>{trade.guestLabel ?? 'Guest'}</span>
            <LiveBadge />
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
        <LiveSummaryLine trade={trade} />
      </div>
    </div>
  );
}

function LiveBadge() {
  return (
    <span
      title="In-person trade with a non-registered visitor"
      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]"
    >
      Live
    </span>
  );
}

function LiveSummaryLine({ trade }: { trade: LiveTradeHistorySummary }) {
  const gaveCount = trade.hostGave.reduce((s, r) => s + r.quantity, 0);
  const gotCount = trade.hostReceived.reduce((s, r) => s + r.quantity, 0);
  // Up to ~4 codes per side keeps the row compact; anything beyond becomes
  // "+N more" so the table still reads as a glanceable history list.
  const previewLimit = 4;
  const gavePreview = trade.hostGave.slice(0, previewLimit).map((r) => r.albumCode).join(', ');
  const gotPreview  = trade.hostReceived.slice(0, previewLimit).map((r) => r.albumCode).join(', ');
  const gaveExtra = trade.hostGave.length > previewLimit
    ? ` +${trade.hostGave.length - previewLimit} more` : '';
  const gotExtra = trade.hostReceived.length > previewLimit
    ? ` +${trade.hostReceived.length - previewLimit} more` : '';
  return (
    <div className="text-xs text-[var(--cromo-fg-muted)] mt-0.5 space-y-0.5">
      {gaveCount > 0 && (
        <div>
          <span className="text-[var(--cromo-fg-subtle)]">Gave</span>{' '}
          <span className="tabular-nums">×{gaveCount}</span>
          <span className="font-mono ml-1.5">{gavePreview}{gaveExtra}</span>
        </div>
      )}
      {gotCount > 0 && (
        <div>
          <span className="text-[var(--cromo-fg-subtle)]">Got</span>{' '}
          <span className="tabular-nums">×{gotCount}</span>
          <span className="font-mono ml-1.5">{gotPreview}{gotExtra}</span>
        </div>
      )}
      {gaveCount === 0 && gotCount === 0 && (
        <div className="italic">Empty trade.</div>
      )}
    </div>
  );
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
