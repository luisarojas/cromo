import { describe, it, expect, beforeEach } from 'vitest';
import { saveDraft, loadDraft, clearDraft } from '@/app/trade/draftStorage';
import type { TradeMatch } from '@/lib/api';
import type { TradePickerItem } from '@/app/trade/components/TradeStickerPicker';

function buildMatch(overrides: Partial<TradeMatch> = {}): TradeMatch {
  return { userId: 'user-1', ...overrides } as TradeMatch;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('draftStorage', () => {
  it('round-trips a draft through sessionStorage', () => {
    const match = buildMatch();
    const items: TradePickerItem[] = [
      { direction: 'offer', variantId: 'v-a', quantity: 2 } as TradePickerItem,
      { direction: 'want', variantId: 'v-b', quantity: 1 } as TradePickerItem,
    ];

    saveDraft(match, items, 500, 0);
    const draft = loadDraft();

    expect(draft).not.toBeNull();
    expect(draft!.matchUserId).toBe('user-1');
    expect(draft!.offerVariants).toEqual([{ variantId: 'v-a', quantity: 2 }]);
    expect(draft!.wantVariants).toEqual([{ variantId: 'v-b', quantity: 1 }]);
    expect(draft!.offerCashCents).toBe(500);
    expect(draft!.wantCashCents).toBe(0);
  });

  it('returns null when no draft is stored', () => {
    expect(loadDraft()).toBeNull();
  });

  it('returns null when the stored draft is for a different match user', () => {
    saveDraft(buildMatch({ userId: 'user-1' }), [], 0, 0);
    expect(loadDraft('user-2')).toBeNull();
  });

  it('returns the draft when the match user matches the filter', () => {
    saveDraft(buildMatch({ userId: 'user-1' }), [], 0, 0);
    expect(loadDraft('user-1')?.matchUserId).toBe('user-1');
  });

  it('clearDraft removes the stored draft', () => {
    saveDraft(buildMatch(), [], 0, 0);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('loadDraft returns null when the stored payload is unparseable', () => {
    sessionStorage.setItem('cromo:trade_propose_draft', '{not json');
    expect(loadDraft()).toBeNull();
  });
});
