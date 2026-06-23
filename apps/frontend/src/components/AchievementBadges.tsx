'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ACHIEVEMENTS } from '@cromo/shared';
import { fetchPublicAchievements, type UnlockedAchievementDto } from '@/lib/api';

interface Props {
  username: string;
  // When the viewer is looking at their own profile, the dashboard already
  // calls the evaluator on mount and writes through to localStorage as a
  // hint. We still re-fetch the persisted set here as the source of truth.
  className?: string;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function AchievementBadges({ username, className }: Props) {
  const locale = useLocale();
  const t = useTranslations('achievements');
  const [unlocked, setUnlocked] = useState<UnlockedAchievementDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchPublicAchievements(username);
        if (!cancelled) setUnlocked(items);
      } catch {
        // Achievements are decorative — a failed read should not block
        // the rest of the profile from rendering.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!loaded) return null;

  const unlockedByKey = new Map(unlocked.map((u) => [u.key, u]));
  const ordered = [...ACHIEVEMENTS].sort((a, b) => a.tier - b.tier);

  // Show ALL definitions: unlocked first (in unlock order), then locked.
  // Locked badges signal "things you can earn" — collectors browsing a
  // profile see the same surface as their own, which makes the system
  // feel discoverable.
  const unlockedDefs = ordered
    .filter((d) => unlockedByKey.has(d.key))
    .sort(
      (a, b) =>
        new Date(unlockedByKey.get(a.key)!.unlockedAt).getTime() -
        new Date(unlockedByKey.get(b.key)!.unlockedAt).getTime(),
    );
  const lockedDefs = ordered.filter((d) => !unlockedByKey.has(d.key));

  return (
    <section className={`rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">{t('sectionTitle')}</h2>
        <span className="text-xs font-mono text-[var(--cromo-fg-subtle)]">
          {unlockedDefs.length} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {unlockedDefs.map((def) => {
          const unlock = unlockedByKey.get(def.key)!;
          const title = t(`${def.key}.title`);
          const description = t(`${def.key}.description`);
          return (
            <li
              key={def.key}
              className="w-9 h-9 rounded-md border border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent)]/5 flex items-center justify-center"
              title={`${title} · ${formatDate(unlock.unlockedAt, locale)}\n${description}`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {def.emoji}
              </span>
            </li>
          );
        })}
        {lockedDefs.map((def) => (
          <li
            key={def.key}
            className="w-9 h-9 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] flex items-center justify-center opacity-50"
            title={`${t(`${def.key}.title`)}\n${t(`${def.key}.description`)}`}
          >
            <span className="text-lg leading-none grayscale" aria-hidden>
              {def.emoji}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
