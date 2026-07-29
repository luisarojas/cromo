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
  recordThirdPartyTrade,
  saveThirdPartyDraft,
  deleteThirdPartyDraft,
  listThirdPartyDrafts,
  type ThirdPartyDraft,
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
import ThirdPartyAppImport from './components/ThirdPartyAppImport';
import ThirdPartyTradeEditor, {
  refKey as thirdPartyRefKey,
  effectiveSelectedRefs,
  type EditorState,
} from './components/ThirdPartyTradeEditor';
import { buildTradeExportText } from './components/buildTradeExportText';
import WeightsEditor from './components/WeightsEditor';
import { BASE_STICKER_CASH_CENTS, type VariantWeights } from '@cromo/shared';
import TradesList from './components/TradesList';
import DraftCard from './components/DraftCard';
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
  // Third-party drafts loaded alongside trades — these are surfaced at the top
  // of My Trades as a "Saved drafts" section. Drafts live in a separate table
  // and never enter the trade_requests history feed.
  const [tpDrafts, setTpDrafts] = useState<ThirdPartyDraft[]>([]);
  // Cross-tab reload counter — bumped when another tab signals a collection
  // change. The trades-load effect depends on it so My Trades stays fresh
  // even if the user accepted/declined in a second window.
  const [tradesReloadTick, setTradesReloadTick] = useState(0);

  // Third-party (external list) state
  const [tpAlbumId, setTpAlbumId] = useState<string>('');
  const [tpPartnerName, setTpPartnerName] = useState<string>('');
  const [tpOffered, setTpOffered] = useState<ExternalListItem[]>([]);
  const [tpWanted, setTpWanted] = useState<ExternalListItem[]>([]);
  // Bumped when a Figuritas QR scan replaces the lists, forcing CombinedListInput
  // to re-seed its textarea from the new offered/wanted props (it only reads them
  // on mount, so a key change is how we push scanned codes into the box).
  const [tpInputKey, setTpInputKey] = useState(0);
  const [tpResult, setTpResult] = useState<MatchAgainstMeResult | null>(null);
  // Per-trade weight overrides. Empty object = "use global defaults" — the
  // service treats undefined and {} identically. Reset whenever the album or
  // pasted lists change so a stale "1 red = 5 base" doesn't follow the user
  // across unrelated trades.
  const [tpWeights, setTpWeights] = useState<VariantWeights>({});
  // Personalised cost per base sticker (cents). Display-only — rescales the
  // editor's dollar values without a backend re-match. Reset alongside weights
  // so a custom price doesn't follow the user into an unrelated trade.
  const [tpBaseStickerCents, setTpBaseStickerCents] = useState(BASE_STICKER_CASH_CENTS);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);
  // Editable trade state — backs the third-party editor. Reset whenever a new
  // match result lands; mutated by the user via the editor's checkboxes + cash
  // inputs; consumed by Save / Copy / Record.
  const [tpEditorState, setTpEditorState] = useState<EditorState>({
    selectedIGet: new Set(),
    selectedTheyGet: new Set(),
    iGetCashCents: 0,
    theyGetCashCents: 0,
  });
  // Tracks an open saved-draft so Save updates in place instead of inserting a
  // new row. Sticks across re-optimizes/edits of the same trade; cleared only
  // when the user explicitly starts a new trade or successfully records this
  // one. This is what stops "Save" from silently forking a duplicate draft.
  const [tpDraftId, setTpDraftId] = useState<string | null>(null);
  const [tpSaving, setTpSaving] = useState(false);
  const [tpCopied, setTpCopied] = useState(false);
  // Tracks the in-flight record-trade call so the button can't be double-clicked
  // and the modal can show the right state.
  const [tpRecording, setTpRecording] = useState(false);
  const [tpConfirmOpen, setTpConfirmOpen] = useState(false);
  const [tpRecordError, setTpRecordError] = useState<string | null>(null);

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
        // Pull trades + drafts in parallel — they're independent endpoints
        // and the My Trades tab needs both rendered before it's useful.
        const [tradesPage, drafts] = await Promise.all([
          fetchTrades({}, token),
          listThirdPartyDrafts(token).catch(() => ({ items: [] })),
        ]);
        if (!cancelled) {
          setTrades(tradesPage.items);
          setTradesCursor(tradesPage.nextCursor);
          setTpDrafts(drafts.items);
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

  // Default editor state derived from a fresh match result: pre-check the
  // optimizer's suggestion, zero cash, no draft. Pulled into a helper so
  // Optimize Trade and weight recompute can share the same reset path.
  function defaultEditorState(result: MatchAgainstMeResult): EditorState {
    const selectedIGet = new Set(result.iGet.map(thirdPartyRefKey));
    const selectedTheyGet = new Set(result.theyGet.map(thirdPartyRefKey));
    return {
      selectedIGet,
      selectedTheyGet,
      iGetCashCents: 0,
      theyGetCashCents: 0,
    };
  }

  // Accepts optional bucket overrides so callers that have *just* set the lists
  // (e.g. a QR scan) can match against the fresh values without waiting for the
  // tpOffered/tpWanted state to settle.
  async function handleTpMatch(offeredArg?: ExternalListItem[], wantedArg?: ExternalListItem[]) {
    if (!token || !tpAlbumId) return;
    const theirOffered = offeredArg ?? tpOffered;
    const theirWanted = wantedArg ?? tpWanted;
    if (theirOffered.length === 0 && theirWanted.length === 0) {
      setTpError('Add at least one code to the offered or wanted list.');
      return;
    }
    setTpLoading(true);
    setTpError(null);
    setTpRecordError(null);
    try {
      const result = await matchAgainstMe(
        {
          albumId: tpAlbumId,
          theirOffered,
          theirWanted,
          variantWeights: Object.keys(tpWeights).length > 0 ? tpWeights : undefined,
        },
        token,
      );
      setTpResult(result);
      // Re-optimizing is a list-level edit, not a cash-level one — preserve
      // any cash the user has already typed so a quick "I forgot to add BRA8"
      // round-trip doesn't wipe their $5 top-up. Mirrors handleTpWeightsCommit.
      setTpEditorState((prev) => ({
        ...defaultEditorState(result),
        iGetCashCents: prev.iGetCashCents,
        theyGetCashCents: prev.theyGetCashCents,
      }));
      // Re-optimizing is an edit to the SAME in-progress trade, so keep any
      // open draft identity (tpDraftId) intact — "Update draft" then keeps
      // writing back to the parked row instead of forking a duplicate. A
      // genuinely new trade starts via the explicit "New trade" reset.
    } catch (err) {
      setTpError(err instanceof Error ? err.message : 'Failed to compute match.');
    } finally {
      setTpLoading(false);
    }
  }

  // A third-party app QR scan (Figuritas, …) lands here: it carries the other
  // collector's offered (their dupes) and wanted (their needs) as Cromo album
  // codes. Drop them into the third-party lists, re-seed the textarea (via the
  // input key), and run the match immediately so the overlap shows without a tap.
  function handleImportedList({ offered, wanted }: { offered: ExternalListItem[]; wanted: ExternalListItem[] }) {
    setTpResult(null);
    setTpWeights({});
    setTpBaseStickerCents(BASE_STICKER_CASH_CENTS);
    setTpOffered(offered);
    setTpWanted(wanted);
    setTpInputKey((k) => k + 1);
    void handleTpMatch(offered, wanted);
  }

  // Apply a new weight table and immediately re-run the match so the balance
  // reflects the negotiated value. Reads weights from the argument (not state)
  // to avoid the stale-closure trap when the editor commits.
  async function handleTpWeightsCommit(next: VariantWeights) {
    setTpWeights(next);
    if (!token || !tpAlbumId || !tpResult) return;
    setTpLoading(true);
    setTpError(null);
    try {
      const result = await matchAgainstMe(
        {
          albumId: tpAlbumId,
          theirOffered: tpOffered,
          theirWanted: tpWanted,
          variantWeights: Object.keys(next).length > 0 ? next : undefined,
        },
        token,
      );
      setTpResult(result);
      // Weight changes shift the suggestion's "fair subset" — re-seed selection
      // from the new optimizer output but preserve any cash the user typed.
      setTpEditorState((prev) => ({
        ...defaultEditorState(result),
        iGetCashCents: prev.iGetCashCents,
        theyGetCashCents: prev.theyGetCashCents,
      }));
    } catch (err) {
      setTpError(err instanceof Error ? err.message : 'Failed to recompute match.');
    } finally {
      setTpLoading(false);
    }
  }

  function handleTpCopy() {
    if (!tpResult) return;
    const meLabel = user?.displayName ?? user?.username ?? 'You';
    const partnerLabel = tpPartnerName.trim() || 'Partner';
    // Effective quantities (the editor's per-row steppers) so the copied text
    // shows the same ×N the balance and the record call will use.
    const iReceive = effectiveSelectedRefs(
      tpResult.candidatesIGet, tpEditorState.selectedIGet, tpEditorState,
    );
    const iGive = effectiveSelectedRefs(
      tpResult.candidatesTheyGet, tpEditorState.selectedTheyGet, tpEditorState,
    );
    const text = buildTradeExportText({
      meLabel,
      partnerLabel,
      iReceive,
      iGive,
      iReceiveCashCents: tpEditorState.iGetCashCents,
      iGiveCashCents: tpEditorState.theyGetCashCents,
    });
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setTpCopied(true);
        setTimeout(() => setTpCopied(false), 2000);
      } catch {
        // Insecure contexts block clipboard — silently fail; user can re-try.
      }
    })();
  }

  async function handleResumeDraft(draft: ThirdPartyDraft) {
    if (!token) return;
    // Switch tabs first so the user sees the editor populate instead of
    // staring at the My Trades list while the match request runs.
    setTpAlbumId(draft.albumId);
    setTpPartnerName(draft.partnerName ?? '');
    setTpOffered(draft.theirOffered);
    setTpWanted(draft.theirWanted);
    setTpDraftId(draft.id);
    setTpResult(null);
    setTpEditorState({
      selectedIGet: new Set(),
      selectedTheyGet: new Set(),
      iGetCashCents: draft.iReceiveCashCents,
      theyGetCashCents: draft.iGiveCashCents,
    });
    // Clear any stale errors from a previous attempt so they don't leak into
    // the resumed editor.
    setTpRecordError(null);
    switchTab('third-party');

    setTpLoading(true);
    setTpError(null);
    try {
      const result = await matchAgainstMe(
        {
          albumId: draft.albumId,
          theirOffered: draft.theirOffered,
          theirWanted: draft.theirWanted,
          variantWeights: Object.keys(tpWeights).length > 0 ? tpWeights : undefined,
        },
        token,
      );
      setTpResult(result);
      // Re-apply the saved selection: any candidate whose stickerVariantId
      // appears in the persisted arrays is checked, and its saved copy count
      // restores the quantity stepper (clamped by the editor to today's pool
      // max, which may have shrunk since the save). Candidates added since
      // the draft was saved (or removed from the user's missing/spare set)
      // simply don't match and stay unchecked, which is the correct fallback.
      const receiveQty = new Map(draft.selectionIReceive.map((s) => [s.stickerVariantId, s.quantity]));
      const giveQty = new Map(draft.selectionIGive.map((s) => [s.stickerVariantId, s.quantity]));
      const quantities: Record<string, number> = {};
      const applySide = (
        candidates: typeof result.candidatesIGet,
        saved: Map<string, number | null>,
      ): Set<string> => {
        const selected = new Set<string>();
        for (const r of candidates) {
          if (!r.stickerVariantId || !saved.has(r.stickerVariantId)) continue;
          selected.add(thirdPartyRefKey(r));
          const qty = saved.get(r.stickerVariantId);
          if (qty != null) quantities[thirdPartyRefKey(r)] = qty;
        }
        return selected;
      };
      setTpEditorState({
        selectedIGet: applySide(result.candidatesIGet, receiveQty),
        selectedTheyGet: applySide(result.candidatesTheyGet, giveQty),
        quantities,
        iGetCashCents: draft.iReceiveCashCents,
        theyGetCashCents: draft.iGiveCashCents,
      });
    } catch (err) {
      setTpError(err instanceof Error ? err.message : 'Failed to load draft.');
    } finally {
      setTpLoading(false);
    }
  }

  async function handleDeleteDraft(id: string) {
    if (!token) return;
    try {
      await deleteThirdPartyDraft(id, token);
      setTpDrafts((prev) => prev.filter((d) => d.id !== id));
      if (tpDraftId === id) setTpDraftId(null);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete draft.');
    }
  }

  // Reset the third-party panel to a blank trade — the ONE intended way to fork
  // a new draft. Keeps the selected album (people usually trade in the same one)
  // but drops the draft identity, partner, lists, result, weights and editor
  // state so the next "Save" inserts a fresh row instead of overwriting the
  // trade that was just parked.
  function handleTpNewTrade() {
    setTpDraftId(null);
    setTpPartnerName('');
    setTpOffered([]);
    setTpWanted([]);
    setTpResult(null);
    setTpWeights({});
    setTpBaseStickerCents(BASE_STICKER_CASH_CENTS);
    setTpEditorState({
      selectedIGet: new Set(),
      selectedTheyGet: new Set(),
      iGetCashCents: 0,
      theyGetCashCents: 0,
    });
    setTpError(null);
    setTpRecordError(null);
    setTpInputKey((k) => k + 1);
  }

  async function handleTpSave() {
    if (!token || !tpAlbumId || !tpResult || tpSaving) return;
    setTpSaving(true);
    try {
      // Persist effective quantities (stepper overrides included) so a
      // resumed draft restores the exact copy counts, not just the ticks.
      const iReceive = effectiveSelectedRefs(
        tpResult.candidatesIGet, tpEditorState.selectedIGet, tpEditorState,
      );
      const iGive = effectiveSelectedRefs(
        tpResult.candidatesTheyGet, tpEditorState.selectedTheyGet, tpEditorState,
      );
      const toSelection = (refs: typeof iReceive) =>
        refs
          .filter((r): r is typeof r & { stickerVariantId: string } => !!r.stickerVariantId)
          .map((r) => ({ stickerVariantId: r.stickerVariantId, quantity: r.quantity }));
      const draft = await saveThirdPartyDraft(
        {
          id: tpDraftId,
          albumId: tpAlbumId,
          partnerName: tpPartnerName.trim() || null,
          theirOffered: tpOffered,
          theirWanted: tpWanted,
          selectionIReceive: toSelection(iReceive),
          selectionIGive: toSelection(iGive),
          iReceiveCashCents: tpEditorState.iGetCashCents,
          iGiveCashCents: tpEditorState.theyGetCashCents,
        },
        token,
      );
      setTpDraftId(draft.id);
      // Keep the in-page draft list aligned so a subsequent visit to My Trades
      // shows the just-saved row without a refetch round-trip.
      setTpDrafts((prev) => {
        const without = prev.filter((d) => d.id !== draft.id);
        return [draft, ...without];
      });
      addToast(tpDraftId ? 'Draft updated.' : 'Draft saved.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setTpSaving(false);
    }
  }

  async function handleTpRecord() {
    if (!token || !tpAlbumId || !tpResult) return;
    // Read deltas from the editor's current selection AND its per-row copy
    // counts, not the optimizer's initial suggestion — the user may have
    // toggled items or dialled a ×3 down to ×1.
    const received = effectiveSelectedRefs(
      tpResult.candidatesIGet, tpEditorState.selectedIGet, tpEditorState,
    )
      .filter((r): r is typeof r & { stickerVariantId: string } => r.stickerVariantId !== null)
      .map((r) => ({ stickerVariantId: r.stickerVariantId, quantity: r.quantity }));
    const gave = effectiveSelectedRefs(
      tpResult.candidatesTheyGet, tpEditorState.selectedTheyGet, tpEditorState,
    )
      .filter((r): r is typeof r & { stickerVariantId: string } => r.stickerVariantId !== null)
      .map((r) => ({ stickerVariantId: r.stickerVariantId, quantity: r.quantity }));
    if (received.length === 0 && gave.length === 0) {
      setTpRecordError('Select at least one sticker before recording.');
      return;
    }
    setTpRecording(true);
    setTpRecordError(null);
    try {
      await recordThirdPartyTrade(
        {
          albumId: tpAlbumId,
          partnerName: tpPartnerName.trim() || null,
          gave,
          received,
        },
        token,
      );
      // Recording consumes the draft (if any) so it doesn't linger as an
      // "open" trade in My Trades after the swap is done.
      if (tpDraftId) {
        try { await deleteThirdPartyDraft(tpDraftId, token); } catch { /* best effort */ }
      }
      addToast('Trade recorded — your collection has been updated.', 'success');
      setTpConfirmOpen(false);
      // A recorded trade is done — reset the whole panel to a blank slate so the
      // page is ready for the NEXT third-party trade instead of re-showing the
      // just-recorded one (which also guards against a refresh-and-record
      // double-commit). Keeps the selected album, like "New trade".
      handleTpNewTrade();
      // Tell other tabs (My Trades, Collection) to refresh.
      if (user) publishSync({ type: 'collection:changed', userId: user.id, albumId: tpAlbumId });
    } catch (err) {
      setTpRecordError(err instanceof Error ? err.message : 'Failed to record the trade.');
    } finally {
      setTpRecording(false);
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
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">
                Match someone&apos;s list against your collection
              </h2>
              {/* Only meaningful once a trade is in progress. Editing a saved
                  draft says so, so the user knows "Update draft" targets that
                  row; "New trade" is the explicit, non-destructive way to fork. */}
              {(tpResult || tpDraftId || tpOffered.length > 0 || tpWanted.length > 0 || tpPartnerName) && (
                <div className="flex shrink-0 items-center gap-2">
                  {tpDraftId && (
                    <span className="rounded-full bg-[var(--cromo-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--cromo-accent)]">
                      Editing saved draft
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTpNewTrade}
                    className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2.5 py-1 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                  >
                    New trade
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--cromo-fg-muted)] mb-4">
              Import their list from another sticker app, paste their offered and wanted
              album codes, or snap a photo of their list. We&apos;ll show what you could
              trade with them — no Cromo account on their side required.
            </p>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">{t('album')}</label>
                <select
                  value={tpAlbumId}
                  onChange={(e) => { setTpAlbumId(e.target.value); setTpResult(null); setTpWeights({}); setTpBaseStickerCents(BASE_STICKER_CASH_CENTS); }}
                  className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
                >
                  {albums.length === 0 && <option value="">No albums found</option>}
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>{albumDisplayName(album)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">
                  Their name <span className="text-[var(--cromo-fg-subtle)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={tpPartnerName}
                  onChange={(e) => setTpPartnerName(e.target.value)}
                  placeholder="e.g. Alex"
                  maxLength={80}
                  className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
                />
              </div>
            </div>

            <CombinedListInput
              key={tpInputKey}
              label="Their list"
              offered={tpOffered}
              wanted={tpWanted}
              onChange={({ offered, wanted }) => { setTpOffered(offered); setTpWanted(wanted); setTpResult(null); setTpWeights({}); setTpBaseStickerCents(BASE_STICKER_CASH_CENTS); }}
              albumTypeKey={albums.find((a) => a.id === tpAlbumId)?.albumTypeKey}
              token={token ?? undefined}
              actions={<ThirdPartyAppImport onResult={handleImportedList} disabled={!tpAlbumId || tpLoading} />}
            />

            <button
              onClick={() => handleTpMatch()}
              disabled={!tpAlbumId || tpLoading}
              className="mt-4 bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {tpLoading ? 'Matching…' : 'Optimize Trade'}
            </button>

            {tpError && (
              <p className="mt-2 text-xs text-[var(--cromo-danger-text)]">{tpError}</p>
            )}
          </div>

          {tpResult && (
            <>
              <ThirdPartyTradeEditor
                title={t('optimalTrade')}
                leftLabel="You"
                rightLabel={tpPartnerName.trim() || 'Them'}
                candidatesIGet={tpResult.candidatesIGet}
                candidatesTheyGet={tpResult.candidatesTheyGet}
                unknownCodes={tpResult.unknownCodes}
                weights={tpWeights}
                baseStickerCents={tpBaseStickerCents}
                state={tpEditorState}
                onStateChange={setTpEditorState}
                onCopy={handleTpCopy}
                onSave={handleTpSave}
                onRecord={() => { setTpRecordError(null); setTpConfirmOpen(true); }}
                saving={tpSaving}
                recording={tpRecording}
                saveLabel={tpDraftId ? 'Update draft' : 'Save draft'}
              />

              {tpCopied && (
                <p className="text-xs text-[var(--cromo-success-text)] -mt-2">Copied to clipboard.</p>
              )}

              {(tpResult.candidatesIGet.length > 0 || tpResult.candidatesTheyGet.length > 0) && (
                <WeightsEditor
                  presentVariants={[
                    ...new Set(
                      [...tpResult.candidatesIGet, ...tpResult.candidatesTheyGet]
                        .map((r) => r.variantToken)
                        .filter((t): t is string => !!t),
                    ),
                  ]}
                  weights={tpWeights}
                  onCommit={handleTpWeightsCommit}
                  busy={tpLoading}
                  baseStickerCents={tpBaseStickerCents}
                  onBaseStickerCentsChange={setTpBaseStickerCents}
                />
              )}

              {tpRecordError && (
                <p className="text-xs text-[var(--cromo-danger-text)]">{tpRecordError}</p>
              )}
            </>
          )}

          {tpConfirmOpen && tpResult && (() => {
            // Copy counts (steppers included), so "3 removed" means 3 physical
            // stickers even when they're multiple copies of one variant.
            const removeCopies = effectiveSelectedRefs(
              tpResult.candidatesTheyGet, tpEditorState.selectedTheyGet, tpEditorState,
            ).reduce((s, r) => s + r.quantity, 0);
            const addCopies = effectiveSelectedRefs(
              tpResult.candidatesIGet, tpEditorState.selectedIGet, tpEditorState,
            ).reduce((s, r) => s + r.quantity, 0);
            return (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => !tpRecording && setTpConfirmOpen(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 space-y-4"
              >
                <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Record this trade?</h3>
                <p className="text-xs text-[var(--cromo-fg-muted)]">
                  Your collection will be updated immediately: <strong>{removeCopies}</strong> sticker{removeCopies === 1 ? '' : 's'} removed,{' '}
                  <strong>{addCopies}</strong> added. This is logged in your trade history but can&apos;t be undone from this screen.
                </p>
                {tpPartnerName.trim() && (
                  <p className="text-xs text-[var(--cromo-fg-muted)]">
                    Partner: <span className="font-medium text-[var(--cromo-fg)]">{tpPartnerName.trim()}</span>
                  </p>
                )}
                {tpRecordError && (
                  <p className="text-xs text-[var(--cromo-danger-text)]">{tpRecordError}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setTpConfirmOpen(false)}
                    disabled={tpRecording}
                    className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTpRecord}
                    disabled={tpRecording}
                    className="rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    {tpRecording ? 'Recording…' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
            );
          })()}
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

          {!tradesLoading && tpDrafts.length > 0 && (
            <div className="mb-5 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
                Saved drafts ({tpDrafts.length})
              </h2>
              <div className="space-y-2">
                {tpDrafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onResume={() => void handleResumeDraft(draft)}
                    onDelete={() => void handleDeleteDraft(draft.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {!tradesLoading && !tradesError && trades.length === 0 && tpDrafts.length === 0 && (
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
