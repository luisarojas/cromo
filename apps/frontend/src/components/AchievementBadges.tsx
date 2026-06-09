'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ACHIEVEMENTS, type AchievementDefinition } from '@cromo/shared';
import { fetchPublicAchievements, type UnlockedAchievementDto } from '@/lib/api';

interface Props {
  username: string;
  // When the viewer is looking at their own profile, the dashboard already
  // calls the evaluator on mount and writes through to localStorage as a
  // hint. We still re-fetch the persisted set here as the source of truth.
  className?: string;
}

function localizedTitle(def: AchievementDefinition, locale: string): string {
  return locale.startsWith('es') ? def.titleEs : def.titleEn;
}

function localizedDescription(def: AchievementDefinition, locale: string): string {
  return locale.startsWith('es') ? def.descriptionEs : def.descriptionEn;
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

  const sectionTitle = locale.startsWith('es') ? 'Logros' : 'Achievements';
  const lockedLabel = locale.startsWith('es') ? 'Bloqueado' : 'Locked';
  const unlockedLabel = locale.startsWith('es') ? 'Desbloqueado' : 'Unlocked';

  return (
    <section className={`rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">{sectionTitle}</h2>
        <span className="text-xs font-mono text-[var(--cromo-fg-subtle)]">
          {unlockedDefs.length} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {unlockedDefs.map((def) => {
          const unlock = unlockedByKey.get(def.key)!;
          return (
            <li
              key={def.key}
              className="rounded-lg border border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent)]/5 p-3 flex flex-col gap-1"
              title={localizedDescription(def, locale)}
            >
              <span className="text-2xl leading-none" aria-hidden>
                {def.emoji}
              </span>
              <span className="text-xs font-semibold text-[var(--cromo-fg)] mt-1">
                {localizedTitle(def, locale)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cromo-accent)]">
                {unlockedLabel} · {formatDate(unlock.unlockedAt, locale)}
              </span>
            </li>
          );
        })}
        {lockedDefs.map((def) => (
          <li
            key={def.key}
            className="rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-3 flex flex-col gap-1 opacity-60"
            title={localizedDescription(def, locale)}
          >
            <span className="text-2xl leading-none grayscale" aria-hidden>
              {def.emoji}
            </span>
            <span className="text-xs font-semibold text-[var(--cromo-fg-muted)] mt-1">
              {localizedTitle(def, locale)}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
              {lockedLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
