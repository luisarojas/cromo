'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  matchPair,
  fetchAlbumTypes,
  DEFAULT_ALBUM_TYPE_KEY,
  type AlbumTypeOption,
  type MatchPairResult,
} from '@/lib/api';
import CombinedListInput from '../components/CombinedListInput';
import ExternalMatchResult from '../components/ExternalMatchResult';

export default function AnonymousMatchPage() {
  const t = useTranslations('tradeMatch');
  const DEFAULT_A_NAME = t('defaultPersonA');
  const DEFAULT_B_NAME = t('defaultPersonB');
  const [albumTypes, setAlbumTypes] = useState<AlbumTypeOption[]>([]);
  const [albumTypeKey, setAlbumTypeKey] = useState<string>(DEFAULT_ALBUM_TYPE_KEY);
  const [aName, setAName] = useState<string>(DEFAULT_A_NAME);
  const [bName, setBName] = useState<string>(DEFAULT_B_NAME);
  const [aOffered, setAOffered] = useState<string[]>([]);
  const [aWanted, setAWanted] = useState<string[]>([]);
  const [bOffered, setBOffered] = useState<string[]>([]);
  const [bWanted, setBWanted] = useState<string[]>([]);
  const [result, setResult] = useState<MatchPairResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlbumTypes()
      .then((items) => {
        if (cancelled) return;
        setAlbumTypes(items);
        // If the default key isn't in the list (older deployments), fall back
        // to the first available type so the UI never points to a stale value.
        if (!items.some((t) => t.key === DEFAULT_ALBUM_TYPE_KEY) && items[0]) {
          setAlbumTypeKey(items[0].key);
        }
      })
      .catch(() => { /* fall back to the hardcoded default */ });
    return () => { cancelled = true; };
  }, []);

  async function handleMatch() {
    if (
      aOffered.length === 0 && aWanted.length === 0 &&
      bOffered.length === 0 && bWanted.length === 0
    ) {
      setError(t('addAtLeastOne'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await matchPair({
        albumTypeKey,
        a: { offered: aOffered, wanted: aWanted },
        b: { offered: bOffered, wanted: bWanted },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCompute'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--cromo-fg)]">{t('title')}</h1>
        <p className="text-sm text-[var(--cromo-fg-muted)] mt-1">
          {t('subtitle')}
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
        <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">
          {t('albumLabel')}
        </label>
        <select
          value={albumTypeKey}
          onChange={(e) => { setAlbumTypeKey(e.target.value); setResult(null); }}
          className="w-full sm:w-auto rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
        >
          {albumTypes.length === 0 && (
            <option value={DEFAULT_ALBUM_TYPE_KEY}>{t('loading')}</option>
          )}
          {albumTypes.map((at) => (
            <option key={at.key} value={at.key}>{at.name}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-[var(--cromo-fg-subtle)]">
          {t('codesValidated')}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
          <input
            type="text"
            value={aName}
            onChange={(e) => setAName(e.target.value)}
            placeholder={DEFAULT_A_NAME}
            aria-label={t('nameForFirst')}
            maxLength={40}
            className="w-full mb-3 bg-transparent text-sm font-semibold text-[var(--cromo-fg)] border-b border-transparent hover:border-[var(--cromo-border)] focus:border-[var(--cromo-accent)] focus:outline-none px-0.5 py-0.5"
          />
          <CombinedListInput
            label={t('theirList')}
            offered={aOffered}
            wanted={aWanted}
            onChange={({ offered, wanted }) => { setAOffered(offered); setAWanted(wanted); }}
            albumTypeKey={albumTypeKey}
          />
        </div>

        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
          <input
            type="text"
            value={bName}
            onChange={(e) => setBName(e.target.value)}
            placeholder={DEFAULT_B_NAME}
            aria-label={t('nameForSecond')}
            maxLength={40}
            className="w-full mb-3 bg-transparent text-sm font-semibold text-[var(--cromo-fg)] border-b border-transparent hover:border-[var(--cromo-border)] focus:border-[var(--cromo-accent)] focus:outline-none px-0.5 py-0.5"
          />
          <CombinedListInput
            label={t('theirList')}
            offered={bOffered}
            wanted={bWanted}
            onChange={({ offered, wanted }) => { setBOffered(offered); setBWanted(wanted); }}
            albumTypeKey={albumTypeKey}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleMatch}
          disabled={loading}
          className="bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? t('matching') : t('findOptimal')}
        </button>
        {error && <p className="text-xs text-[var(--cromo-danger-text)]">{error}</p>}
      </div>

      {result && (
        <div className="mt-6">
          <ExternalMatchResult
            title={t('optimalTradeTitle')}
            leftLabel={aName.trim() || DEFAULT_A_NAME}
            leftReceives={result.aGets}
            rightLabel={bName.trim() || DEFAULT_B_NAME}
            rightReceives={result.bGets}
            mutualOverlap={result.mutualOverlap}
            unknownCodes={result.unknownCodes}
          />
        </div>
      )}
    </div>
  );
}
