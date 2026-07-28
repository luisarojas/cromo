'use client';

import { useTranslations } from 'next-intl';
import { HeartIcon } from '@/components/HeartIcon';

interface ActionBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  colorClass: string;
  children: React.ReactNode;
  label: string;
}

function ActionBtn({ onClick, disabled, title, colorClass, children, label }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colorClass}`}
    >
      {children}
      <span className="text-[9px] font-medium leading-none">{label}</span>
    </button>
  );
}

interface Props {
  selectedCount: number;
  totalDisplayed: number;
  allDisplayedSelected: boolean;
  hasAnyOwned: boolean;
  favouriteState: 'all' | 'some' | 'none';
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onToggleFavourite: () => void;
  onAddVariant: () => void;
  onRemoveVariant: () => void;
  onTradeHide: () => void;
  onTradeShow: () => void;
  onTradeReset: () => void;
  onExit: () => void;
  isWorking: boolean;
}

export default function MassActionBar({
  selectedCount,
  totalDisplayed,
  allDisplayedSelected,
  hasAnyOwned,
  favouriteState,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onToggleFavourite,
  onAddVariant,
  onRemoveVariant,
  onTradeHide,
  onTradeShow,
  onTradeReset,
  onExit,
  isWorking,
}: Props) {
  const t = useTranslations('massAction');
  const noneSelected = selectedCount === 0;

  return (
    <div
      // Sits above the MobileTabBar on mobile via the shared --cromo-tabbar-h
      // token; on desktop the token resolves to 0 so the bar hugs the bottom.
      style={{ bottom: 'var(--cromo-tabbar-h)' }}
      className="fixed left-0 right-0 z-40 bg-[var(--cromo-surface)] border-t border-[var(--cromo-border)] shadow-cromo-lg"
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
        {/* Checkbox + count */}
        <button
          onClick={allDisplayedSelected ? onDeselectAll : onSelectAll}
          title={allDisplayedSelected ? t('deselectAllTitle') : t('selectAllTitle', { count: totalDisplayed })}
          className="flex items-center justify-center w-5 h-5 rounded border-2 border-[var(--cromo-accent)] flex-shrink-0 transition-colors"
        >
          {allDisplayedSelected ? (
            <svg className="w-3 h-3 text-[var(--cromo-accent)]" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : selectedCount > 0 ? (
            <span className="w-2 h-0.5 bg-blue-400 inline-block" />
          ) : null}
        </button>

        <span className="text-sm font-medium text-[var(--cromo-fg)] whitespace-nowrap">
          {noneSelected ? t('none') : selectedCount}
          <span className="text-[var(--cromo-fg-subtle)] font-normal"> / {totalDisplayed}</span>
        </span>

        <div className="h-8 w-px bg-[var(--cromo-surface-2)] flex-shrink-0 mx-0.5" />

        {/* Actions */}
        {isWorking ? (
          <div className="flex items-center gap-2 text-xs text-[var(--cromo-fg-subtle)] px-2">
            <svg className="w-4 h-4 animate-spin text-[var(--cromo-accent)]" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
            {t('working')}
          </div>
        ) : (
          // Single non-wrapping row that scrolls horizontally if the actions
          // don't fit — keeps the bar one row tall instead of wrapping to two
          // and stealing a big chunk of the bottom of the screen on mobile.
          <div className="flex-1 min-w-0 flex items-center gap-0.5 flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ActionBtn
              onClick={onDelete}
              disabled={noneSelected || !hasAnyOwned}
              title={t('deleteTitle')}
              colorClass="text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-danger-soft)]"
              label={t('deleteLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </ActionBtn>

            <div className="h-6 w-px shrink-0 bg-[var(--cromo-surface-2)] mx-0.5" />

            <ActionBtn
              onClick={onToggleFavourite}
              disabled={noneSelected}
              title={favouriteState === 'all' ? t('removeFavTitle') : t('addFavTitle')}
              colorClass={favouriteState === 'all' ? 'text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-danger-soft)]' : 'text-[var(--cromo-fg-subtle)] hover:bg-[var(--cromo-surface-2)]'}
              label={favouriteState === 'all' ? t('unfavLabel') : t('favLabel')}
            >
              <HeartIcon filled={favouriteState === 'all'} className="w-4 h-4" />
            </ActionBtn>

            <div className="h-6 w-px shrink-0 bg-[var(--cromo-surface-2)] mx-0.5" />

            <ActionBtn
              onClick={onAddVariant}
              disabled={noneSelected}
              title={t('addVariantTitle')}
              colorClass="text-[var(--cromo-success-text)] hover:bg-[var(--cromo-success-soft)]"
              label={t('addVariantLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </ActionBtn>

            <ActionBtn
              onClick={onRemoveVariant}
              disabled={noneSelected || !hasAnyOwned}
              title={t('removeVariantTitle')}
              colorClass="text-orange-500 hover:bg-orange-50"
              label={t('removeVariantLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </ActionBtn>

            <div className="h-6 w-px shrink-0 bg-[var(--cromo-surface-2)] mx-0.5" />

            <ActionBtn
              onClick={onTradeHide}
              disabled={noneSelected || !hasAnyOwned}
              title={t('tradeHideTitle')}
              colorClass="text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]"
              label={t('tradeHideLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              </svg>
            </ActionBtn>

            <ActionBtn
              onClick={onTradeShow}
              disabled={noneSelected || !hasAnyOwned}
              title={t('tradeShowTitle')}
              colorClass="text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)]"
              label={t('tradeShowLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
              </svg>
            </ActionBtn>

            <ActionBtn
              onClick={onTradeReset}
              disabled={noneSelected || !hasAnyOwned}
              title={t('tradeResetTitle')}
              colorClass="text-[var(--cromo-fg-subtle)] hover:bg-[var(--cromo-surface-2)]"
              label={t('tradeResetLabel')}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </ActionBtn>
          </div>
        )}

        {/* Exit */}
        <button
          onClick={onExit}
          title={t('exitTitle')}
          className="ml-auto flex-shrink-0 p-1.5 rounded-lg text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
