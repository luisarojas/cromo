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
  initialWantVariantIds?: string[];
  initialOfferCash?: number;
  initialWantCash?: number;
  onHideSticker: (variantId: string) => void;
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
  initialWantVariantIds,
  initialOfferCash,
  initialWantCash,
  onHideSticker,
  onChange,
  onCancel,
  onSend,
}: ProposeTradeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg flex flex-col max-h-[95vh]">
        <div className="px-6 pt-6 pb-4 border-b border-[var(--cromo-border)] shrink-0">
          <h2 className="text-lg font-semibold text-[var(--cromo-fg)]">Propose Trade</h2>
          <p className="text-sm text-[var(--cromo-fg-muted)] mt-0.5">
            With{' '}
            <span className="font-medium text-[var(--cromo-fg)]">
              {match.displayName ?? match.username}
            </span>{' '}
            (@{match.username})
          </p>
        </div>

        <div className="px-6 py-4 flex-1 min-h-0 flex flex-col">
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
            initialOfferVariants={initialOfferVariants}
            initialWantVariantIds={initialWantVariantIds}
            initialOfferCash={initialOfferCash}
            initialWantCash={initialWantCash}
            onChange={onChange}
          />

          {error && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mt-4">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-[var(--cromo-border)] shrink-0">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSend}
              disabled={submitting || pickerItems.length === 0}
              className="flex-[2] bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
