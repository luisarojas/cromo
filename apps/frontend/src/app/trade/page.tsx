'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import {
  fetchUserAlbums,
  fetchTradeMatches,
  fetchTrades,
  fetchCollection,
  fetchFavourites,
  fetchPublicProfile,
  createTrade,
  createTradeInvite,
  createLiveTradeSession,
  setTradeFlags,
  patchUserPreferences,
  matchAgainstMe,
  albumDisplayName,
  type UserAlbum,
  type TradeMatch,
  type TradeSummary,
  type TradeHistoryItem,
  type CollectionItem,
  type City,
  type ExternalListItem,
  type MatchAgainstMeResult,
  type TradeInvite,
} from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { type TradePickerItem } from './components/TradeStickerPicker';
import ProposeTradeModal from './components/ProposeTradeModal';
import CombinedListInput from './components/CombinedListInput';
import ExternalMatchResult from './components/ExternalMatchResult';
import TradesList from './components/TradesList';
import { publishSync, subscribeSync } from '@/lib/syncBus';
import CityAutocomplete from '@/components/CityAutocomplete';
import { BottomSheet } from '@/components/BottomSheet';

import { saveDraft, clearDraft, loadDraft } from './draftStorage';

// Leaflet pulls in `window` at module load — must not render server-side.
const MatchesMap = dynamic(() => import('./components/MatchesMap'), { ssr: false });

const RADIUS_PRESETS_KM = [10, 25, 50, 100, 250, 500];

type Tab = 'find' | 'third-party' | 'my';

interface ProposeModalState {
  match: TradeMatch;
  pickerItems: TradePickerItem[];
  offerCash: number;
  wantCash: number;
  submitting: boolean;
  error: string | null;
  offerItems: CollectionItem[];
  offerItemsLoading: boolean;
  draftOfferVariants?: { variantId: string; quantity: number }[];
  draftWantVariants?: { variantId: string; quantity: number }[];
  draftOfferCash?: number;
  draftWantCash?: number;
}

function TradePageContent() {
  const t = useTranslations('tradePage');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const myCities = usePreferencesStore((s) => s.cities);
  const setCities = usePreferencesStore((s) => s.setCities);
  const searchRadiusKm = usePreferencesStore((s) => s.searchRadiusKm);
  const setSearchRadiusKm = usePreferencesStore((s) => s.setSearchRadiusKm);

  const [citiesSaving, setCitiesSaving] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [selectedMatchUserId, setSelectedMatchUserId] = useState<string | null>(null);
  const radiusSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCitiesChange(next: City[]) {
    if (!token) return;
    setCities(next);
    setCitiesSaving(true);
    setCitiesError(null);
    try {
      await patchUserPreferences({ cities: next }, token);
    } catch {
      setCitiesError('Failed to save. Please try again.');
    } finally {
      setCitiesSaving(false);
    }
  }

  // Slider fires onChange continuously; debounce the network write so dragging
  // doesn't fire one PATCH per integer step. The store update is immediate so
  // the map redraws while the user is still scrubbing.
  function handleRadiusChange(next: number) {
    setSearchRadiusKm(next);
    if (radiusSaveTimerRef.current) clearTimeout(radiusSaveTimerRef.current);
    radiusSaveTimerRef.current = setTimeout(() => {
      if (!token) return;
      patchUserPreferences({ searchRadiusKm: next }, token).catch(() => {});
    }, 400);
  }

  const rawTab = searchParams.get('tab');
  const initialTab: Tab =
    rawTab === 'my' ? 'my'
    : rawTab === 'third-party' ? 'third-party'
    : 'find';
  const [tab, setTab] = useState<Tab>(initialTab);
  // When true, candidates outside the search radius are included (ranked
  // lower via the distance penalty). When false, the backend applies the
  // radius as a hard filter.
  const [showAll, setShowAll] = useState(false);

  // Deep link: /trade?recipient=<username> opens the propose modal for that
  // user. If the viewer has an album selected we also run Find Matches in
  // parallel so the modal can pre-suggest mutually-needed stickers; otherwise
  // the modal opens with empty suggestions (trade without a match).
  const recipientHint = searchParams.get('recipient');
  const recipientHandledRef = useRef(false);
  const recipientProfileFetchedRef = useRef(false);
  const [recipientProfile, setRecipientProfile] = useState<TradeMatch | null>(null);
  // Per-album cache of the propose-modal's offer-picker collection so opening
  // multiple matches in the same album doesn't refetch up to 1000 items.
  // Cleared whenever the active album changes or trade flags are mutated.
  const offerItemsCacheRef = useRef<Map<string, CollectionItem[]>>(new Map());
  const [recipientNotFound, setRecipientNotFound] = useState(false);

  function switchTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/trade?${params.toString()}`);
  }

  // Find Trades state
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [favouriteCodes, setFavouriteCodes] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesMoreLoading, setMatchesMoreLoading] = useState(false);
  const [matchesCursor, setMatchesCursor] = useState<string | null>(null);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesSearched, setMatchesSearched] = useState(false);

  // My Trades state
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesMoreLoading, setTradesMoreLoading] = useState(false);
  const [tradesCursor, setTradesCursor] = useState<string | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  // Cross-tab reload counter — bumped when another tab signals a collection
  // change. The trades-load effect depends on it so My Trades stays fresh
  // even if the user accepted/declined in a second window.
  const [tradesReloadTick, setTradesReloadTick] = useState(0);

  // Third-party (external list) state
  const [tpAlbumId, setTpAlbumId] = useState<string>('');
  const [tpOffered, setTpOffered] = useState<ExternalListItem[]>([]);
  const [tpWanted, setTpWanted] = useState<ExternalListItem[]>([]);
  const [tpResult, setTpResult] = useState<MatchAgainstMeResult | null>(null);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);

  // Propose modal
  const [proposeModal, setProposeModal] = useState<ProposeModalState | null>(null);
  const draftRestoredRef = useRef(false);

  // QR invite modal — minted on open so the host can hand someone an
  // in-person link. The whole rest of the trade flow is unchanged; the
  // scanner just lands at /trade/invite/<token> and gets bounced to the
  // same recipient-prefilled propose flow the profile button uses.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInvite, setQrInvite] = useState<TradeInvite | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrCopied, setQrCopied] = useState(false);

  // Single "Trade in person" CTA opens this chooser, which routes to either
  // the QR invite (other party has an account) or a live-trade session (they
  // don't). Keeps the two flows discoverable behind one entry point.
  const [inPersonChooserOpen, setInPersonChooserOpen] = useState(false);

  // Live-trade button: route the host into the room for the selected album so
  // they can share the join code with someone who doesn't have an account.
  const { addToast } = useToast();
  const [liveTradeBusy, setLiveTradeBusy] = useState(false);
  async function handleStartLiveTrade() {
    if (!token || !selectedAlbumId || liveTradeBusy) return;
    setLiveTradeBusy(true);
    try {
      const session = await createLiveTradeSession(selectedAlbumId, token);
      setInPersonChooserOpen(false);
      router.push(`/trade/live/${session.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not start a live trade.');
    } finally {
      setLiveTradeBusy(false);
    }
  }

  const handleOpenQr = async () => {
    if (!token) return;
    setInPersonChooserOpen(false);
    setQrOpen(true);
    setQrCopied(false);
    if (qrInvite) return;
    setQrLoading(true);
    setQrError(null);
    try {
      const invite = await createTradeInvite(token);
      setQrInvite(invite);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : t('qrError'));
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyQrLink = async () => {
    if (!qrInvite) return;
    try {
      await navigator.clipboard.writeText(qrInvite.url);
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch {
      // clipboard refused — URL is visible in the modal
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function loadAlbums() {
      if (!token || !user) return;
      try {
        const data = await fetchUserAlbums(user.id, token);
        if (!cancelled) {
          setAlbums(data);
          if (data.length > 0) {
            const defaultAlbum = data.find((a) => a.isDefault) ?? data[0];
            setSelectedAlbumId(defaultAlbum!.id);
            setTpAlbumId(defaultAlbum!.id);
          }
        }
      } catch {
        // non-fatal
      }
    }

    loadAlbums();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router]);

  useEffect(() => {
    if (tab !== 'my' || !token) return;

    let cancelled = false;

    async function loadTrades() {
      if (!token) return;
      setTradesLoading(true);
      setTradesError(null);
      try {
        const { items, nextCursor } = await fetchTrades({}, token);
        if (!cancelled) {
          setTrades(items);
          setTradesCursor(nextCursor);
        }
      } catch (err) {
        if (!cancelled)
          setTradesError(err instanceof Error ? err.message : 'Failed to load trades');
      } finally {
        if (!cancelled) setTradesLoading(false);
      }
    }

    loadTrades();
    return () => {
      cancelled = true;
    };
  }, [tab, token, tradesReloadTick]);

  // Cross-tab refresh for My Trades. Listens to the narrowly-scoped
  // trade:changed event (published from every trade mutation: create,
  // accept, decline, cancel, complete, message-send) so the list stays
  // fresh without over-refreshing on every sticker add elsewhere.
  useEffect(() => {
    if (!user) return;
    return subscribeSync((event) => {
      if (event.type !== 'trade:changed') return;
      if (event.userId !== user.id) return;
      setTradesReloadTick((n) => n + 1);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedAlbumId || !token || !user) {
      setFavouriteCodes(new Set());
      return;
    }
    let cancelled = false;
    fetchFavourites(user.id, selectedAlbumId, token)
      .then((codes) => {
        if (!cancelled) setFavouriteCodes(new Set(codes));
      })
      .catch(() => {
        if (!cancelled) setFavouriteCodes(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAlbumId, token, user]);

  // Auto-restore a trade draft if the user refreshed mid-proposal
  useEffect(() => {
    if (draftRestoredRef.current || !hydrated || !token || !user || !selectedAlbumId) return;
    const draft = loadDraft();
    if (!draft) return;
    draftRestoredRef.current = true;
    openProposeModal(draft.match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, selectedAlbumId]);

  // Deep-link from a public profile: fetch the recipient's public profile so
  // we can open the propose modal even when there's no mutual-overlap match.
  useEffect(() => {
    if (recipientProfileFetchedRef.current || !recipientHint || !token) return;
    recipientProfileFetchedRef.current = true;
    fetchPublicProfile(recipientHint)
      .then((p) => {
        setRecipientProfile({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          mutualOverlap: 0,
          theyHave: [],
          theyHaveVariantIds: [],
          youHave: [],
          cities: [],
          distanceKm: null,
        });
      })
      .catch(() => setRecipientNotFound(true));
  }, [recipientHint, token]);

  // Deep-link from a public profile: if the viewer has an album selected,
  // also run Find Matches in parallel so the propose modal can pre-suggest
  // mutually-needed stickers when there is overlap.
  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !token || !selectedAlbumId) return;
    if (matchesLoading || matchesSearched) return;
    void handleFindMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientHint, token, selectedAlbumId]);

  // Open the propose modal once we have the recipient's profile. If we also
  // searched matches and found the recipient there, prefer the richer match
  // payload (includes youHave / theyHave suggestions).
  useEffect(() => {
    if (recipientHandledRef.current || !recipientHint || !recipientProfile) return;
    if (selectedAlbumId && !matchesSearched) return;
    recipientHandledRef.current = true;
    const enriched = matches.find((m) => m.username === recipientProfile.username);
    openProposeModal(enriched ?? recipientProfile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, matchesSearched, recipientHint, recipientProfile, selectedAlbumId]);

  // Re-run the search when the radius filter toggle flips (or radius changes),
  // but only after the user has already kicked off the first search — otherwise
  // we'd fire a Find Matches just from arriving at the page.
  useEffect(() => {
    if (!matchesSearched) return;
    void handleFindMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  // Scroll the selected match card into view when a map pin is clicked.
  useEffect(() => {
    if (!selectedMatchUserId) return;
    const el = document.getElementById(`match-${selectedMatchUserId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedMatchUserId]);

  async function handleFindMatches() {
    if (!token || !selectedAlbumId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    setMatches([]);
    setMatchesCursor(null);
    setMatchesTotal(0);
    setMatchesSearched(false);
    try {
      const page = await fetchTradeMatches(selectedAlbumId, token, { showAll });
      setMatches(page.items);
      setMatchesCursor(page.nextCursor);
      setMatchesTotal(page.total);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to find matches');
    } finally {
      setMatchesLoading(false);
      setMatchesSearched(true);
    }
  }

  async function handleLoadMoreMatches() {
    if (!token || !selectedAlbumId || !matchesCursor || matchesMoreLoading) return;
    setMatchesMoreLoading(true);
    try {
      const page = await fetchTradeMatches(selectedAlbumId, token, { cursor: matchesCursor, showAll });
      setMatches((prev) => [...prev, ...page.items]);
      setMatchesCursor(page.nextCursor);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : 'Failed to load more matches');
    } finally {
      setMatchesMoreLoading(false);
    }
  }

  function openProposeModal(match: TradeMatch) {
    const draft = loadDraft(match.userId);

    // Re-use a previously-fetched collection for the same album so opening
    // several matches in a row doesn't refetch up to 1000 items every time.
    const cached = selectedAlbumId
      ? offerItemsCacheRef.current.get(selectedAlbumId)
      : undefined;

    setProposeModal({
      match,
      pickerItems: [],
      offerCash: draft?.offerCashCents ?? 0,
      wantCash: draft?.wantCashCents ?? 0,
      submitting: false,
      error: null,
      offerItems: cached ?? [],
      offerItemsLoading: !!selectedAlbumId && cached === undefined,
      draftOfferVariants: draft?.offerVariants,
      draftWantVariants: draft?.wantVariants,
      draftOfferCash: draft?.offerCashCents,
      draftWantCash: draft?.wantCashCents,
    });

    if (cached !== undefined) return;

    if (token && user && selectedAlbumId) {
      const albumIdAtFetch = selectedAlbumId;
      fetchCollection(user.id, { albumId: albumIdAtFetch, limit: 1000 }, token)
        .then((result) => {
          offerItemsCacheRef.current.set(albumIdAtFetch, result.items);
          setProposeModal((prev) =>
            prev ? { ...prev, offerItems: result.items, offerItemsLoading: false } : prev,
          );
        })
        .catch(() => {
          setProposeModal((prev) => (prev ? { ...prev, offerItemsLoading: false } : prev));
        });
    }
  }

  async function handleHideSticker(variantId: string) {
    await setTradeHiddenFlag(variantId, true);
  }
  async function handleUnhideSticker(variantId: string) {
    await setTradeHiddenFlag(variantId, false);
  }
  async function setTradeHiddenFlag(variantId: string, hidden: boolean) {
    if (!user || !token || !selectedAlbumId) return;
    setProposeModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        offerItems: prev.offerItems.map((item) =>
          item.stickerVariantId === variantId ? { ...item, tradeHidden: hidden } : item,
        ),
      };
    });
    // Keep the per-album cache aligned with the optimistic update so the next
    // openProposeModal doesn't show a stale tradeHidden value.
    offerItemsCacheRef.current.delete(selectedAlbumId);
    try {
      await setTradeFlags(user.id, variantId, { tradeHidden: hidden }, token, selectedAlbumId);
    } catch {
      setProposeModal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          offerItems: prev.offerItems.map((item) =>
            item.stickerVariantId === variantId ? { ...item, tradeHidden: !hidden } : item,
          ),
        };
      });
    }
  }

  async function handleTpMatch() {
    if (!token || !tpAlbumId) return;
    if (tpOffered.length === 0 && tpWanted.length === 0) {
      setTpError('Add at least one code to the offered or wanted list.');
      return;
    }
    setTpLoading(true);
    setTpError(null);
    try {
      const result = await matchAgainstMe(
        { albumId: tpAlbumId, theirOffered: tpOffered, theirWanted: tpWanted },
        token,
      );
      setTpResult(result);
    } catch (err) {
      setTpError(err instanceof Error ? err.message : 'Failed to compute match.');
    } finally {
      setTpLoading(false);
    }
  }

  async function handleSendTradeRequest() {
    if (!proposeModal || !token || !user) return;

    const { pickerItems, offerCash, wantCash } = proposeModal;
    const hasOffer = pickerItems.some((i) => i.direction === 'offer') || offerCash > 0;
    const hasWant = pickerItems.some((i) => i.direction === 'want') || wantCash > 0;

    if (!hasOffer || !hasWant) {
      setProposeModal((prev) =>
        prev ? { ...prev, error: 'Add at least one sticker or cash amount to offer and to request.' } : prev,
      );
      return;
    }

    setProposeModal((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));

    try {
      const result = await createTrade(
        {
          recipientId: proposeModal.match.userId,
          requesterAlbumId: selectedAlbumId || undefined,
          items: pickerItems.map((i) => ({ variantId: i.variantId, direction: i.direction, quantity: i.quantity })),
          offerCash,
          wantCash,
        },
        token,
      );
      clearDraft();
      setProposeModal(null);
      if (user) publishSync({ type: 'trade:changed', userId: user.id, tradeId: result.id });
      router.push(`/trade/${result.id}`);
    } catch (err) {
      setProposeModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              error: err instanceof Error ? err.message : 'Failed to send trade request',
            }
          : prev,
      );
    }
  }

  // The backend now does the distance filtering + ordering, so the page just
  // renders whatever it returned. Kept as a named local so the JSX still reads
  // as a "visible matches" loop.
  const visibleMatches = matches;
  const hasGeocodedCity = myCities.some((c) => typeof c.lat === 'number' && typeof c.lng === 'number');

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[var(--cromo-fg)]">{t('title')}</h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setInPersonChooserOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent)]/20 transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm6-2h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zm6 0h2v-2h2v2h2v2h-2v2h-2v-2h-2v2h-2v-4h2v-2zm4 4h2v-2h-2v2z" />
            </svg>
            {t('tradeInPerson')}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">{t('yourCities')}</label>
        <CityAutocomplete cities={myCities} onChange={handleCitiesChange} />
        {citiesSaving && <p className="mt-1.5 text-xs text-[var(--cromo-fg-subtle)]">{t('saving')}</p>}
        {citiesError && <p className="mt-1.5 text-xs text-[var(--cromo-danger-text)]">{citiesError}</p>}
        <p className="mt-1.5 text-xs text-[var(--cromo-fg-subtle)]">{t('citiesHint')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--cromo-border)]">
        <button
          onClick={() => switchTab('find')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'find'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          {t('tabs.find')}
        </button>
        <button
          onClick={() => switchTab('third-party')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'third-party'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          {t('tabs.thirdParty')}
        </button>
        <button
          onClick={() => switchTab('my')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'my'
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          {t('tabs.my')}
        </button>
      </div>

      {/* Find Trades tab */}
      {tab === 'find' && (
        <div>
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-3">{t('findTradingPartners')}</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">{t('album')}</label>
                <select
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
                >
                  {albums.length === 0 && <option value="">{t('noAlbumsFound')}</option>}
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {albumDisplayName(album)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleFindMatches}
                disabled={!selectedAlbumId || matchesLoading}
                className="bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {matchesLoading ? t('searching') : t('findMatches')}
              </button>
            </div>
          </div>

          {matchesError && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">
              {matchesError}
            </div>
          )}

          {recipientNotFound && (
            <div className="rounded-lg bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 p-3 text-sm text-amber-800 mb-4">
              Couldn&apos;t find that user.
            </div>
          )}

          {matchesLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
              ))}
            </div>
          )}

          {!matchesLoading && matches.length === 0 && !matchesError && selectedAlbumId && (
            <p className="text-sm text-[var(--cromo-fg-muted)] text-center py-8">
              {matchesSearched ? 'No matches found.' : 'Use "Find Matches" to search.'}
            </p>
          )}

          {!matchesLoading && matches.length > 0 && (
            <div className="space-y-3">
              {hasGeocodedCity && (
                <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-[240px]">
                      <label className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <span className="text-xs font-medium text-[var(--cromo-fg-muted)] whitespace-nowrap">
                          Radius: <span className="font-semibold text-[var(--cromo-fg)]">{searchRadiusKm} km</span>
                        </span>
                        <input
                          type="range"
                          min={5}
                          max={500}
                          step={5}
                          value={Math.min(searchRadiusKm, 500)}
                          onChange={(e) => handleRadiusChange(Number(e.target.value))}
                          className="flex-1 accent-[var(--cromo-accent)]"
                          aria-label="Search radius in kilometres"
                        />
                      </label>
                      <div className="flex gap-1 flex-wrap">
                        {RADIUS_PRESETS_KM.map((km) => (
                          <button
                            key={km}
                            type="button"
                            onClick={() => handleRadiusChange(km)}
                            className={`text-xs px-2 py-0.5 rounded border ${
                              searchRadiusKm === km
                                ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
                                : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
                            }`}
                          >
                            {km}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showAll}
                        onChange={(e) => setShowAll(e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
                      />
                      <span className="text-sm text-[var(--cromo-fg-muted)]">Show all (ignore radius)</span>
                    </label>
                  </div>
                  <MatchesMap
                    myCities={myCities}
                    radiusKm={searchRadiusKm}
                    matches={visibleMatches}
                    onSelectMatch={setSelectedMatchUserId}
                    selectedUserId={selectedMatchUserId}
                  />
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-[var(--cromo-fg-muted)]">
                  Found {matches.length} potential {matches.length === 1 ? 'partner' : 'partners'}
                  {hasGeocodedCity && !showAll && ` within ${searchRadiusKm} km`}
                </p>
              </div>
              {matchesTotal > matches.length && (
                <p className="text-xs text-[var(--cromo-fg-subtle)]">
                  Showing {matches.length} of {matchesTotal}
                </p>
              )}
              {visibleMatches.map((match) => (
                <div
                  key={match.userId}
                  id={`match-${match.userId}`}
                  className={`rounded-xl border bg-[var(--cromo-surface)] p-4 flex items-center gap-4 transition-colors ${
                    selectedMatchUserId === match.userId
                      ? 'border-[var(--cromo-accent)] ring-2 ring-[var(--cromo-accent)]/30'
                      : 'border-[var(--cromo-border)]'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-sm font-bold text-[var(--cromo-accent-fg)]">
                    {(match.displayName ?? match.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--cromo-fg)] truncate">
                      {match.displayName ?? match.username}
                    </div>
                    <div className="text-xs text-[var(--cromo-fg-muted)]">@{match.username}</div>
                    <div className="mt-1 flex gap-3 text-xs text-[var(--cromo-fg-muted)] flex-wrap">
                      <span className="text-[var(--cromo-accent)] font-medium">
                        {match.mutualOverlap} mutual stickers
                      </span>
                      <span>They have {match.theyHave.length} you need</span>
                      <span>You have {match.youHave.length} they need</span>
                      {match.distanceKm !== null && (
                        <span title="Distance to your nearest city">
                          {match.distanceKm < 10
                            ? `${match.distanceKm.toFixed(1)} km away`
                            : `${Math.round(match.distanceKm)} km away`}
                        </span>
                      )}
                    </div>
                    {match.cities.length > 0 && (
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {match.cities.map((city) => (
                          <span
                            key={city.placeId}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              myCities.some((mc) => mc.placeId === city.placeId)
                                ? 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]'
                                : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]'
                            }`}
                          >
                            {city.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openProposeModal(match)}
                    className="bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium transition-colors shrink-0"
                  >
                    Propose Trade
                  </button>
                </div>
              ))}
              {matchesCursor && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleLoadMoreMatches}
                    disabled={matchesMoreLoading}
                    className="bg-[var(--cromo-surface-2)] hover:bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {matchesMoreLoading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Third-Party tab — match a non-registered person's list against you */}
      {tab === 'third-party' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-1">
              Match someone&apos;s list against your collection
            </h2>
            <p className="text-xs text-[var(--cromo-fg-muted)] mb-4">
              Paste a friend&apos;s offered and wanted album codes, or upload a photo
              of their list. We&apos;ll show what you could trade with them — no
              account on their side required.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">{t('album')}</label>
              <select
                value={tpAlbumId}
                onChange={(e) => setTpAlbumId(e.target.value)}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
              >
                {albums.length === 0 && <option value="">No albums found</option>}
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>{albumDisplayName(album)}</option>
                ))}
              </select>
            </div>

            <CombinedListInput
              label="Their list"
              offered={tpOffered}
              wanted={tpWanted}
              onChange={({ offered, wanted }) => { setTpOffered(offered); setTpWanted(wanted); }}
              albumTypeKey={albums.find((a) => a.id === tpAlbumId)?.albumTypeKey}
              token={token ?? undefined}
            />

            <button
              onClick={handleTpMatch}
              disabled={!tpAlbumId || tpLoading}
              className="mt-4 bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {tpLoading ? 'Matching…' : 'Find Trade'}
            </button>

            {tpError && (
              <p className="mt-2 text-xs text-[var(--cromo-danger-text)]">{tpError}</p>
            )}
          </div>

          {tpResult && (
            <ExternalMatchResult
              title={t('optimalTrade')}
              leftLabel="You"
              leftReceives={tpResult.iGet}
              rightLabel="They"
              rightReceives={tpResult.theyGet}
              mutualOverlap={tpResult.mutualOverlap}
              unknownCodes={tpResult.unknownCodes}
              balance={tpResult.balance}
            />
          )}
        </div>
      )}

      {/* My Trades tab */}
      {tab === 'my' && (
        <div>
          {tradesError && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">
              {tradesError}
            </div>
          )}

          {tradesLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
              ))}
            </div>
          )}

          {!tradesLoading && !tradesError && trades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--cromo-fg-muted)]">{t('noTradesYet')}</p>
              <button
                onClick={() => switchTab('find')}
                className="mt-3 text-sm text-[var(--cromo-accent)] hover:underline"
              >
                Find trading partners
              </button>
            </div>
          )}

          {!tradesLoading && trades.length > 0 && (
            <div className="space-y-2">
              {user && (
                <TradesList
                  trades={trades}
                  myUserId={user.id}
                  onOpen={(id) => router.push(`/trade/${id}`)}
                />
              )}
              {tradesCursor && (
                <button
                  onClick={async () => {
                    if (!token || tradesMoreLoading) return;
                    setTradesMoreLoading(true);
                    try {
                      const { items, nextCursor } = await fetchTrades({ cursor: tradesCursor }, token);
                      setTrades((prev) => [...prev, ...items]);
                      setTradesCursor(nextCursor);
                    } catch (err) {
                      setTradesError(err instanceof Error ? err.message : 'Failed to load more trades');
                    } finally {
                      setTradesMoreLoading(false);
                    }
                  }}
                  disabled={tradesMoreLoading}
                  className="w-full text-sm text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] font-medium py-3 disabled:opacity-50"
                >
                  {tradesMoreLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Propose Trade Modal */}
      {proposeModal && token && (
        <ProposeTradeModal
          match={proposeModal.match}
          offerItems={proposeModal.offerItems}
          offerItemsLoading={proposeModal.offerItemsLoading}
          pickerItems={proposeModal.pickerItems}
          error={proposeModal.error}
          submitting={proposeModal.submitting}
          favouriteCodes={favouriteCodes}
          token={token}
          initialOfferVariants={proposeModal.draftOfferVariants}
          initialWantVariants={proposeModal.draftWantVariants}
          initialOfferCash={proposeModal.draftOfferCash}
          initialWantCash={proposeModal.draftWantCash}
          onHideSticker={handleHideSticker}
          onUnhideSticker={handleUnhideSticker}
          onChange={(items, offerCash, wantCash) => {
            setProposeModal((prev) => {
              if (!prev) return prev;
              saveDraft(prev.match, items, offerCash, wantCash);
              return { ...prev, pickerItems: items, offerCash, wantCash };
            });
          }}
          onCancel={() => { clearDraft(); setProposeModal(null); }}
          onSend={handleSendTradeRequest}
        />
      )}

      {inPersonChooserOpen && (
        <BottomSheet
          open
          onClose={() => setInPersonChooserOpen(false)}
          ariaLabel={t('tradeInPerson')}
        >
          <div className="p-6 flex flex-col gap-4">
            <h2 className="text-base font-semibold text-[var(--cromo-fg)] text-center">
              {t('tradeInPerson')}
            </h2>
            <p className="text-xs text-[var(--cromo-fg-muted)] text-center">
              {t('inPersonChooserHint')}
            </p>
            <button
              onClick={handleOpenQr}
              className="flex flex-col items-start gap-1 rounded-btn border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent)]/10 px-4 py-3 text-left text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent)]/20 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm6-2h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zm6 0h2v-2h2v2h2v2h-2v2h-2v-2h-2v2h-2v-4h2v-2zm4 4h2v-2h-2v2z" />
                </svg>
                {t('inPersonHasAccount')}
              </span>
              <span className="text-xs text-[var(--cromo-fg-muted)]">
                {t('inPersonHasAccountHint')}
              </span>
            </button>
            <button
              onClick={handleStartLiveTrade}
              disabled={!selectedAlbumId || liveTradeBusy}
              className="flex flex-col items-start gap-1 rounded-btn border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent)]/10 px-4 py-3 text-left text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="10" cy="10" r="3" />
                  <circle cx="10" cy="10" r="7" />
                </svg>
                {liveTradeBusy ? 'Starting…' : t('inPersonGuest')}
              </span>
              <span className="text-xs text-[var(--cromo-fg-muted)]">
                {t('inPersonGuestHint')}
              </span>
            </button>
          </div>
        </BottomSheet>
      )}

      {qrOpen && (
        <BottomSheet open onClose={() => setQrOpen(false)} ariaLabel={t('qrModalTitle')}>
          <div className="p-6 flex flex-col items-center gap-4">
            <h2 className="text-base font-semibold text-[var(--cromo-fg)]">
              {t('qrModalTitle')}
            </h2>
            <p className="text-xs text-[var(--cromo-fg-muted)] text-center">
              {t('qrModalHint')}
            </p>
            {qrLoading && (
              <p className="text-sm text-[var(--cromo-fg-subtle)] italic py-12">
                {t('qrGenerating')}
              </p>
            )}
            {qrError && (
              <p className="text-sm text-[var(--cromo-danger-text)] py-4">{qrError}</p>
            )}
            {qrInvite && !qrError && (
              <>
                <div className="rounded-lg bg-white p-4">
                  <QRCodeSVG value={qrInvite.url} size={224} />
                </div>
                <p className="text-xs font-mono text-[var(--cromo-fg-muted)] text-center break-all px-2">
                  {qrInvite.url}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
                  {t('qrModalExpires')}
                </p>
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={handleCopyQrLink}
                    className="flex-1 rounded-btn border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface-2)] px-3 py-2 text-xs font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
                  >
                    {qrCopied ? t('qrCopied') : t('qrCopyLink')}
                  </button>
                  <button
                    onClick={() => setQrOpen(false)}
                    className="flex-1 rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-3 py-2 text-xs font-semibold"
                  >
                    {t('qrDone')}
                  </button>
                </div>
              </>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
          Loading…
        </div>
      }
    >
      <TradePageContent />
    </Suspense>
  );
}
