'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { fetchPublicList, type PublicList, type PublicListItem } from '@/lib/api';
import { foldAccents } from '@/lib/normalize';
import { variantLabel } from '@/app/album/components/variantMeta';

function groupByTeam(items: PublicListItem[], otherLabel: string): Map<string, PublicListItem[]> {
  const grouped = new Map<string, PublicListItem[]>();
  for (const item of items) {
    const key = item.teamName ?? otherLabel;
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

export default function ShareListPage() {
  const t = useTranslations('sharePage');
  const locale = useLocale();
  const params = useParams();
  const token =
    typeof params.token === 'string' ? params.token : (params.token?.[0] ?? '');

  const [list, setList] = useState<PublicList | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchPublicList(token);
        if (!cancelled) setList(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('410') || msg.includes('404') || msg.includes('not found')) {
          setGone(true);
        } else {
          setError(msg || t('failedToLoad'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    const q = foldAccents(search.trim());
    if (!q) return list.items;
    return list.items.filter(
      (item) =>
        foldAccents(item.albumCode).includes(q) ||
        foldAccents(item.playerName ?? '').includes(q),
    );
  }, [list, search]);

  const otherLabel = t('otherTeam');
  const groupedItems = useMemo(() => groupByTeam(filteredItems, otherLabel), [filteredItems, otherLabel]);
  const sortedTeams = useMemo(
    () =>
      [...groupedItems.keys()].sort((a, b) => {
        if (a === otherLabel) return 1;
        if (b === otherLabel) return -1;
        return a.localeCompare(b);
      }),
    [groupedItems, otherLabel],
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-8 w-64 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-4 w-40 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-10 rounded-lg bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-48 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (gone) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-10">
          <div className="text-4xl mb-3">410</div>
          <h1 className="text-xl font-semibold text-[var(--cromo-fg)] mb-2">{t('goneTitle')}</h1>
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            {t('goneBody')}
          </p>
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-4 text-sm text-[var(--cromo-danger-text)]">
          {error ?? t('failedToLoadShort')}
        </div>
      </div>
    );
  }

  const ownerName = list.owner.displayName ?? `@${list.owner.username}`;
  const listTypeLabels: Record<string, string> = {
    missing: t('listTypes.missing'),
    duplicates: t('listTypes.duplicates'),
    full_collection: t('listTypes.fullCollection'),
  };
  const listTypeLabel = listTypeLabels[list.listType] ?? list.listType;
  const createdDate = new Date(list.createdAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const showQuantity = list.listType === 'duplicates';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[var(--cromo-fg)]">{t('listTitle', { owner: ownerName, list: listTypeLabel })}</h1>
            <div className="text-xs text-[var(--cromo-fg-subtle)] mt-1">
              @{list.owner.username} &middot; {t('sharedOn', { date: createdDate })}
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] px-3 py-1 text-xs font-medium">
            {t('stickerCount', { count: list.items.length })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>
        {search && (
          <p className="text-xs text-[var(--cromo-fg-subtle)] mt-1">
            {t('searchShowing', { shown: filteredItems.length, total: list.items.length })}
          </p>
        )}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            {search ? t('noMatch') : t('emptyList')}
          </p>
        </div>
      )}

      {/* Grouped sticker list */}
      <div className="space-y-4">
        {sortedTeams.map((team) => {
          const teamItems = groupedItems.get(team) ?? [];
          return (
            <div key={team} className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
              <div className="px-4 py-2.5 border-b border-[var(--cromo-border)] bg-transparent rounded-t-xl">
                <h2 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">
                  {team}{' '}
                  <span className="font-normal text-[var(--cromo-fg-subtle)]">({teamItems.length})</span>
                </h2>
              </div>
              <div className="divide-y divide-gray-50">
                {teamItems.map((item) => (
                  <div
                    key={item.stickerVariantId}
                    className="flex items-center justify-between px-4 py-2.5 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-[var(--cromo-fg-muted)] shrink-0">
                          {item.albumCode}
                        </span>
                        {item.playerName && (
                          <span className="text-sm text-[var(--cromo-fg)] truncate">
                            {item.playerName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5 flex gap-1.5">
                        {item.stickerType !== 'player' && (
                          <span>{item.stickerType} &middot;</span>
                        )}
                        <span>{variantLabel(item.variantType)}</span>
                      </div>
                    </div>
                    {showQuantity && item.quantity != null && item.quantity > 1 && (
                      <span className="shrink-0 rounded-full bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] px-2 py-0.5 text-xs font-medium">
                        &times;{item.quantity}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
