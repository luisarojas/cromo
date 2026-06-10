'use client';

import { useMemo, useState } from 'react';
import type { TradeSummary } from '@/lib/api';

// Renders "My Trades" as cards on mobile and a sortable table on md+. Sort
// state lives in this component; the caller passes the raw list and the
// open-trade handler. Pagination (Load more) stays on the parent — sorting
// only reorders what's already loaded.

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

function closedAt(trade: TradeSummary): string | null {
  return trade.completedAt ?? trade.cancelledAt ?? null;
}

type SortKey = 'created' | 'closed' | 'status' | 'other';
type SortDir = 'asc' | 'desc';

interface Props {
  trades: TradeSummary[];
  myUserId: string;
  onOpen: (tradeId: string) => void;
}

export default function TradesList({ trades, myUserId, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [closedOpen, setClosedOpen] = useState(false);

  const { openTrades, closedTrades } = useMemo(() => {
    const cmpFn = (a: TradeSummary, b: TradeSummary) => {
      let cmp = 0;
      if (sortKey === 'created') {
        cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      } else if (sortKey === 'closed') {
        // Trades with no closing date sort to the end regardless of dir.
        const aC = closedAt(a);
        const bC = closedAt(b);
        if (aC === null && bC === null) cmp = 0;
        else if (aC === null) return 1;
        else if (bC === null) return -1;
        else cmp = Date.parse(aC) - Date.parse(bC);
      } else if (sortKey === 'status') {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      } else if (sortKey === 'other') {
        const aOther = a.requesterId === myUserId ? a.recipientUsername : a.requesterUsername;
        const bOther = b.requesterId === myUserId ? b.recipientUsername : b.requesterUsername;
        cmp = aOther.localeCompare(bOther);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    };
    const open: TradeSummary[] = [];
    const closed: TradeSummary[] = [];
    for (const t of trades) {
      (OPEN_STATUSES.has(t.status) ? open : closed).push(t);
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
              <TradeRow key={trade.id} trade={trade} myUserId={myUserId} onOpen={onOpen} />
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
                <TradeRow key={trade.id} trade={trade} myUserId={myUserId} onOpen={onOpen} />
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TradeRow({
  trade,
  myUserId,
  onOpen,
}: {
  trade: TradeSummary;
  myUserId: string;
  onOpen: (tradeId: string) => void;
}) {
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

function MobileGroup({
  trades,
  myUserId,
  onOpen,
  emptyLabel,
}: {
  trades: TradeSummary[];
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
      {trades.map((trade) => {
        const badge = STATUS_BADGE[trade.status];
        const isRequester = trade.requesterId === myUserId;
        const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
        const closed = closedAt(trade);
        return (
          <button
            key={trade.id}
            onClick={() => onOpen(trade.id)}
            className="w-full text-left rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 hover:border-[var(--cromo-accent)]/30 hover:bg-[var(--cromo-accent-soft)] transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--cromo-fg)] truncate">
                  @{otherUser}
                </div>
                <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5">
                  Opened {new Date(trade.createdAt).toLocaleDateString()}
                  {closed && (
                    <> · Closed {new Date(closed).toLocaleDateString()}</>
                  )}
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
