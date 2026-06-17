'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Shared mobile bottom-sheet wrapper. Used by anything that's a centred modal
// on desktop but should anchor to the bottom edge on phones — the
// touch-friendly default established by VariantPopover and Scanner.
//
// On mobile: rounded-top sheet, 92vh max, safe-area-aware, locks background
// scroll, dismisses on backdrop tap, Escape, or swipe-down on the handle.
//
// On desktop: behaves as a centred modal in a translucent backdrop so the
// existing modal call sites don't need a parallel desktop component.
//
// The wrapper deliberately leaves padding and header structure to the caller
// — each modal already has its own internal layout; this just gives them a
// touch-correct outer container.

const DISMISS_THRESHOLD_PX = 100;
const DRAG_MAX_PX = 240;

// Anything that could receive focus. Excludes [tabindex="-1"] (intentionally
// unreachable) and explicit `disabled` controls. Used by the focus trap to
// cycle Tab within the sheet.
const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  children,
  // Caller can opt out of the visual drag handle (e.g. when the sheet's
  // header already provides a clear "close" affordance). Disables the
  // swipe-down dismiss too since the gesture starts from the handle.
  showHandle = true,
  // When false, the backdrop is render-only — useful for sheets with their
  // own outside-click handling.
  dismissOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  showHandle?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Remembered focus to restore when the sheet closes. Captured once per open
  // cycle on the open→true transition; restored on cleanup.
  const openerRef = useRef<Element | null>(null);

  // Swipe-down dismiss. Touch starts on the handle, tracks vertical delta,
  // commits past DISMISS_THRESHOLD_PX. Restricted to the handle so finger
  // gestures inside body content (lists, scrollable rows) don't accidentally
  // dismiss.
  const dragStartRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [snapping, setSnapping] = useState(false);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap + restore. Capture the opener, focus the first thing inside
  // the sheet, and intercept Tab so it cycles within. Restore opener focus on
  // close so keyboard users land where they started.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    // Defer one tick so children have mounted and rendered.
    const id = window.setTimeout(() => {
      const root = sheetRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      // Fall back to focusing the dialog itself so keyboard input has a home.
      (first ?? root).focus();
    }, 0);

    const onTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = sheetRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onTabKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onTabKey);
      // Restore opener focus only if it's still in the DOM and focusable.
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [open]);

  // ─── Handle-driven swipe-down ────────────────────────────────────────────
  function onHandleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    dragStartRef.current = t.clientY;
    setSnapping(false);
  }
  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - dragStartRef.current;
    // Only react to downward drag; treat upward drag as a no-op (no rubber
    // band) so users who flick the handle the wrong way don't see weirdness.
    setDragY(Math.max(0, Math.min(DRAG_MAX_PX, dy)));
  }
  function onHandleTouchEnd() {
    const dy = dragY;
    dragStartRef.current = null;
    setSnapping(true);
    if (dy >= DISMISS_THRESHOLD_PX) {
      // Animate out, then close.
      setDragY(DRAG_MAX_PX);
      window.setTimeout(onClose, 140);
    } else {
      setDragY(0);
    }
  }

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={dismissOnBackdrop ? onClose : undefined}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // tabIndex=-1 lets us focus the dialog itself as a fallback when it
        // has no focusable children.
        tabIndex={-1}
        // Mobile: bottom sheet. Desktop: centred max-w-lg card. Caller's own
        // padding/scroll behaviour stays intact inside `children`.
        className="fixed inset-x-0 bottom-0 z-50 w-full max-h-[92vh] flex flex-col bg-[var(--cromo-surface)] rounded-t-2xl shadow-cromo-lg overflow-y-auto md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:rounded-2xl md:max-h-[85vh] outline-none"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: snapping ? 'transform 140ms ease-out' : 'none',
        }}
      >
        {showHandle && (
          // The drag handle IS the swipe-down dismiss surface — restricting
          // the gesture here avoids stealing touches from scrollable body
          // content (lists, sticker rows, message threads).
          <div
            className="flex justify-center py-2 md:hidden cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
            onTouchCancel={() => { dragStartRef.current = null; setSnapping(true); setDragY(0); }}
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-[var(--cromo-border)]" />
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}
