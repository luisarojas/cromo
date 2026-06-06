// Thin wrapper over SpeechSynthesis. Used by the scanner so the user can run
// scans hands-free — phone propped up, both hands on the sticker pile, the
// app reads each match out as it lands. No-ops cleanly on browsers without
// SpeechSynthesis (older Android WebViews) and respects the persisted mute
// toggle in localStorage. Reduced-motion users opt out by default since this
// is also an attention/sensory cost.

import { prefersReducedMotion } from './haptics';

const MUTE_KEY = 'cromo:speechMuted';

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSpeechMuted(): boolean {
  if (typeof window === 'undefined') return true;
  if (prefersReducedMotion()) return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSpeechMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (muted) {
      window.localStorage.setItem(MUTE_KEY, '1');
    } else {
      window.localStorage.removeItem(MUTE_KEY);
    }
  } catch {
    // ignore
  }
}

export function speak(text: string): void {
  if (!isSpeechSupported() || isSpeechMuted()) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 0.9;
    window.speechSynthesis.cancel(); // never let utterances pile up.
    window.speechSynthesis.speak(u);
  } catch {
    // some webviews throw on speak() — swallow.
  }
}
