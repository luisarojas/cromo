import { useEffect, type RefObject } from 'react';

// Close-on-outside-interaction for popovers, dropdowns, and overflow menus.
// Listens for mousedown (covers desktop click + the synthetic mouse event
// touch browsers fire), touchstart (covers cases where the synthetic mouse
// is suppressed by passive listeners), and Escape. The handler only fires
// while `enabled` is true so the listeners don't churn for every menu in
// the tree.
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const node = ref.current;
      if (node && !node.contains(e.target as Node)) onOutside();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', onEsc);
    };
  }, [ref, onOutside, enabled]);
}
