'use client';

import type { TradeMatch } from '@/lib/api';
import type { TradePickerItem } from './components/TradeStickerPicker';

const DRAFT_KEY = 'cromo:trade_propose_draft';

export interface TradeDraft {
  matchUserId: string;
  match: TradeMatch;
  offerVariants: { variantId: string; quantity: number }[];
  wantVariants: { variantId: string; quantity: number }[];
  offerCashCents: number;
  wantCashCents: number;
}

export function saveDraft(
  match: TradeMatch,
  items: TradePickerItem[],
  offerCashCents: number,
  wantCashCents: number,
): void {
  try {
    const draft: TradeDraft = {
      matchUserId: match.userId,
      match,
      offerVariants: items
        .filter((i) => i.direction === 'offer')
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      wantVariants: items
        .filter((i) => i.direction === 'want')
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      offerCashCents,
      wantCashCents,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function loadDraft(matchUserId?: string): TradeDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as TradeDraft;
    if (matchUserId !== undefined && draft.matchUserId !== matchUserId) return null;
    return draft;
  } catch {
    return null;
  }
}
