'use client';

import TradeStickerPicker, { type TradePickerItem } from './TradeStickerPicker';
import type { CollectionItem, TradeMatch } from '@/lib/api';

export interface ProposeTradeModalProps {
  match: TradeMatch;
  offerItems: CollectionItem[];
  offerItemsLoading: boolean;
  pickerItems: TradePickerItem[];
  error: string | null;
  submitting: boolean;
  favouriteCodes: Set<string>;
  token: string;
  initialOfferVariants?: { variantId: string; quantity: number }[];
  initialWantVariants?: { variantId: string; quantity: number }[];
  initialOfferCash?: number;
  initialWantCash?: number;
  onHideSticker: (variantId: string) => void;
  onUnhideSticker: (variantId: string) => void;
  onChange: (items: TradePickerItem[], offerCash: number, wantCash: number) => void;
  onCancel: () => void;
  onSend: () => void;
}

export default function ProposeTradeModal({
  match,
  offerItems,
  offerItemsLoading,
  pickerItems,
  error,
  submitting,
  favouriteCodes,
  token,
  initialOfferVariants,
  initialWantVariants,
  initialOfferCash,
  initialWantCash,
  onHideSticker,
  onUnhideSticker,
  onChange,
  onCancel,
  onSend,
}: ProposeTradeModalProps) {
  return (
    // Mobile: full-bleed sheet (inset-0, no rounded edges, no outer padding).
    // Desktop (sm+): centered modal with padding, max width, max height.
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/50 sm:p-4">
      <div
        className="w-full sm:max-w-5xl sm:rounded-xl border-0 sm:border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg flex flex-col h-[100dvh] sm:h-auto sm:max-h-[95vh]"
        style={{
          // Reserve space for iOS home indicator on full-screen mobile.
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-[var(--cromo-border)] shrink-0 flex items-start gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            className="sm:hidden shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-md text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 11-1.414 1.414L8 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L6.586 10 3.293 6.707a1 1 0 011.414-1.414L8 8.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--cromo-fg)]">Propose Trade</h2>
            <p className="text-xs sm:text-sm text-[var(--cromo-fg-muted)] mt-0.5 truncate">
              With{' '}
              <span className="font-medium text-[var(--cromo-fg)]">
                {match.displayName ?? match.username}
              </span>{' '}
              <span className="text-[var(--cromo-fg-subtle)]">@{match.username}</span>
            </p>
          </div>
        </div>

        <div className="px-3 sm:px-6 py-3 sm:py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          <TradeStickerPicker
            key={match.userId}
            offerItems={offerItems}
            offerItemsLoading={offerItemsLoading}
            suggestedOfferCodes={match.youHave}
            suggestedWantCodes={match.theyHave}
            suggestedWantVariantIds={match.theyHaveVariantIds}
            token={token}
            partnerName={match.displayName ?? match.username}
            favouriteCodes={favouriteCodes}
            onHideSticker={onHideSticker}
            onUnhideSticker={onUnhideSticker}
            initialOfferVariants={initialOfferVariants}
            initialWantVariants={initialWantVariants}
            initialOfferCash={initialOfferCash}
            initialWantCash={initialWantCash}
            onChange={onChange}
          />

          {error && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mt-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 border-t border-[var(--cromo-border)] shrink-0 bg-[var(--cromo-surface)]">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] rounded-md px-4 py-3 sm:py-2 text-sm font-medium disabled:opacity-50 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={onSend}
              disabled={submitting || pickerItems.length === 0}
              className="flex-[2] bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-3 sm:py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {submitting ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
