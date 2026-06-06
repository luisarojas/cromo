// Thin wrapper over the Vibration API. On unsupported browsers (most desktops,
// iOS Safari) this is a no-op — never throws, never branches at call sites.

export type HapticPattern = 'tap' | 'success' | 'warn' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [12, 40, 18],
  warn: [20, 60, 20],
  error: [40, 30, 40, 30, 40],
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function haptic(pattern: HapticPattern = 'tap'): void {
  if (typeof navigator === 'undefined') return;
  // Treat reduced-motion as "no vibration" — users who opt out of animation
  // often have vestibular or sensory reasons to avoid haptic buzzes too.
  if (prefersReducedMotion()) return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(PATTERNS[pattern]);
  } catch {
    // some embedded webviews throw on vibrate — swallow.
  }
}
