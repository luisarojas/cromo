'use client';

import { useEffect, useRef, useState } from 'react';
import { haptic, prefersReducedMotion } from '@/lib/haptics';

// Touch-driven pull-to-refresh wrapper. Only activates when the document is
// scrolled to the top AND the user pulls down — both checks matter because
// without the scroll guard, a downward swipe mid-list would fight the natural
// scroll. The threshold is conservative (80px) so it stays out of the way for
// users who scroll back up to read the header.

interface Props {
  onRefresh: () => Promise<void> | void;
  // Disable on screens where it would compete with sticky chrome (e.g. when a
  // modal is open). Caller decides.
  disabled?: boolean;
  children: React.ReactNode;
}

const TRIGGER_PX = 80;
const MAX_PULL = 110;

export default function PullToRefresh({ onRefresh, disabled, children }: Props) {
  const startYRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const triggeredRef = useRef(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = prefersReducedMotion();
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled || refreshing) return;
    // Only arm when at the very top of the document.
    if ((window.scrollY || document.documentElement.scrollTop) > 0) return;
    startYRef.current = e.touches[0]!.clientY;
    triggeredRef.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startYRef.current === null || refreshing) return;
    const dy = e.touches[0]!.clientY - startYRef.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band — distance grows but slows past the trigger.
    const damped = dy < TRIGGER_PX ? dy : TRIGGER_PX + (dy - TRIGGER_PX) * 0.4;
    setPull(Math.min(MAX_PULL, damped));
    if (damped >= TRIGGER_PX && !triggeredRef.current) {
      triggeredRef.current = true;
      haptic('tap');
    }
  }
  async function onTouchEnd() {
    const shouldFire = pull >= TRIGGER_PX && !refreshing;
    startYRef.current = null;
    if (shouldFire) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const indicatorOpacity = Math.min(1, pull / TRIGGER_PX);
  const indicatorRotate = Math.min(180, (pull / TRIGGER_PX) * 180);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { startYRef.current = null; setPull(0); }}
    >
      {/* Pull indicator — absolutely positioned above content so the layout
          shift only happens during the gesture, not in steady state. */}
      <div
        aria-hidden
        className="pointer-events-none flex items-center justify-center text-[var(--cromo-fg-muted)]"
        style={{
          height: pull,
          opacity: indicatorOpacity,
          transition: reduceMotion.current || pull === 0 ? undefined : 'height 120ms ease',
        }}
      >
        {refreshing ? (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 12a9 9 0 11-3-6.7" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: `rotate(${indicatorRotate}deg)`, transition: reduceMotion.current ? undefined : 'transform 80ms linear' }}
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        )}
      </div>
      {children}
    </div>
  );
}
