'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Shared mobile bottom-sheet wrapper. Used by anything that's a centred modal
// on desktop but should anchor to the bottom edge on phones — the
// touch-friendly default established by VariantPopover and Scanner.
//
// On mobile: rounded-top sheet, 92vh max, safe-area-aware, locks background
// scroll, dismisses on backdrop tap or Escape.
//
// On desktop: behaves as a centred modal in a translucent backdrop so the
// existing modal call sites don't need a parallel desktop component.
//
// The wrapper deliberately leaves padding and header structure to the caller
// — each modal already has its own internal layout; this just gives them a
// touch-correct outer container.
export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  children,
  // Caller can opt out of the visual drag handle (e.g. when the sheet's
  // header already provides a clear "close" affordance).
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

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={dismissOnBackdrop ? onClose : undefined}
        className="fixed inset-0 z-40 bg-black/50 md:flex md:items-center md:justify-center"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // Mobile: bottom sheet. Desktop: centred max-w-lg card. Caller's own
        // padding/scroll behaviour stays intact inside `children`.
        className="fixed inset-x-0 bottom-0 z-50 w-full max-h-[92vh] flex flex-col bg-[var(--cromo-surface)] rounded-t-2xl shadow-cromo-lg overflow-y-auto md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:rounded-2xl md:max-h-[85vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {showHandle && (
          <div className="flex justify-center py-2 md:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-[var(--cromo-border)]" />
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}
