'use client';

import { useEffect, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { speak } from '@/lib/speech';

// One-shot full-screen celebration that fires the first time a user completes
// an album. We track "have I already shown this for albumId X" in localStorage
// so the user only gets the moment once per album, even if stats bounce around
// during edits. Auto-dismisses after 6 seconds or on tap.

interface Props {
  albumId: string | null;
  albumLabel: string;
  percentage: number;
}

const SEEN_KEY = 'cromo:celebratedAlbums';

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function markSeen(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const seen = readSeen();
    seen.add(id);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
}

export default function CompletionCelebration({ albumId, albumLabel, percentage }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!albumId) return;
    if (percentage < 100) return;
    if (readSeen().has(albumId)) return;
    markSeen(albumId);
    setShow(true);
    haptic('success');
    speak(`${albumLabel} complete!`);
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, [albumId, albumLabel, percentage]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={() => setShow(false)}
      role="dialog"
      aria-label="Album complete"
    >
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4 animate-bounce" aria-hidden>🏆</div>
        <p className="text-xs uppercase tracking-widest text-[var(--cromo-accent)] font-semibold mb-2">Album complete</p>
        <h2 className="text-3xl font-display font-bold text-white mb-3 cromo-chrome-text">{albumLabel}</h2>
        <p className="text-sm text-white/80 leading-relaxed">
          Every sticker checked off. You did the thing collectors spend a year chasing.
        </p>
        <p className="mt-6 text-xs text-white/60">Tap anywhere to dismiss</p>
      </div>
    </div>
  );
}
