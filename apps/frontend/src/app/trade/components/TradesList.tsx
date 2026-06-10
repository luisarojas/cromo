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

type SortKey = 'created' | 'status' | 'other' | 'messages';
type SortDir = 'asc' | 'desc';

interface Props {
  trades: TradeSummary[];
  myUserId: string;
  onOpen: (tradeId: string) => void;
}

export default function TradesList({ trades, myUserId, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created') {
        cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      } else if (sortKey === 'status') {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      } else if (sortKey === 'messages') {
        cmp = a.messageCount - b.messageCount;
      } else if (sortKey === 'other') {
        const aOther = a.requesterId === myUserId ? a.recipientUsername : a.requesterUsername;
        const bOther = b.requesterId === myUserId ? b.recipientUsername : b.requesterUsername;
        cmp = aOther.localeCompare(bOther);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [trades, sortKey, sortDir, myUserId]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Created defaults to newest-first; other keys default to A→Z.
      setSortDir(key === 'created' ? 'desc' : 'asc');
    }
  }

  return (
    <>
      {/* Mobile / sm: card stack (unchanged from prior render). */}
      <div className="md:hidden space-y-2">
        {sorted.map((trade) => {
          const badge = STATUS_BADGE[trade.status];
          const isRequester = trade.requesterId === myUserId;
          const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
          return (
            <button
              key={trade.id}
              onClick={() => onOpen(trade.id)}
              className="w-full text-left rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 hover:border-[var(--cromo-accent)]/30 hover:bg-[var(--cromo-accent-soft)] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--cromo-fg)] truncate">
                    {isRequester ? 'To' : 'From'}: @{otherUser}
                  </div>
                  <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5">
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
      </div>

      {/* md+: sortable table. The header buttons toggle sort; the active key
          shows a direction arrow. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--cromo-border)]">
              <SortHeader label="Direction" />
              <SortHeader label="With" active={sortKey === 'other'} dir={sortDir} onClick={() => toggleSort('other')} />
              <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
              <SortHeader label="Messages" align="right" active={sortKey === 'messages'} dir={sortDir} onClick={() => toggleSort('messages')} />
              <SortHeader label="Created" align="right" active={sortKey === 'created'} dir={sortDir} onClick={() => toggleSort('created')} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((trade) => {
              const badge = STATUS_BADGE[trade.status];
              const isRequester = trade.requesterId === myUserId;
              const otherUser = isRequester ? trade.recipientUsername : trade.requesterUsername;
              return (
                <tr
                  key={trade.id}
                  onClick={() => onOpen(trade.id)}
                  className="border-b border-[var(--cromo-border)] hover:bg-[var(--cromo-accent-soft)] cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 text-[var(--cromo-fg-muted)]">{isRequester ? 'To' : 'From'}</td>
                  <td className="px-3 py-2 text-[var(--cromo-fg)] font-medium">@{otherUser}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">{trade.messageCount}</td>
                  <td className="px-3 py-2 text-right text-[var(--cromo-fg-muted)] tabular-nums">{new Date(trade.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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
