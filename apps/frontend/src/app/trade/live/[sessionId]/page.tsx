'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/ToastProvider';
import {
  completeLiveTradeSession,
  setLiveTradeCash,
  setLiveTradeList,
  setLiveTradeLock,
  setLiveTradeStaged,
  setLiveTradeWeights,
  undoLiveTradeSession,
  type LiveTradeSession,
  type LiveTradeStickerRef,
  type ExternalListItem,
} from '@/lib/api';
import {
  computeScarcityBalance,
  suggestBalancingCashCents,
  type ScarcityTotals,
  type VariantWeights,
} from '@cromo/shared';
import { getGuestToken } from '@/lib/liveTradeStorage';
import CombinedListInput from '../../components/CombinedListInput';
import WeightsEditor from '../../components/WeightsEditor';
import {
  ALL_VARIANT_TYPES,
  compareVariantTypes,
  variantLabel,
} from '../../../collection/components/variantMeta';
import { useLiveTradeSession } from '../useLiveTradeSession';

type Role = 'host' | 'guest';

// ─── Pure helpers ──────────────────────────────────────────────────────────

function refKey(ref: { stickerVariantId: string }): string {
  return ref.stickerVariantId;
}

function refLabel(ref: LiveTradeStickerRef): string {
  const player = ref.playerName ?? 'Unknown';
  const variant = ref.variantLabel
    && ref.variantToken !== 'base_borderless'
    && ref.variantToken !== 'base_border'
    ? ` (${ref.variantLabel})` : '';
  return `${ref.albumCode} · ${player}${variant}`;
}

function stagedQuantity(ref: { stickerVariantId: string }, staged: LiveTradeStickerRef[]): number {
  return staged.find((s) => s.stickerVariantId === ref.stickerVariantId)?.quantity ?? 0;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function LiveTradePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const { addToast } = useToast();

  // The guest token is read from localStorage on mount only; it's set there by
  // /join when the guest first lands. The host doesn't need one — their JWT
  // is enough.
  const [guestToken, setGuestToken] = useState<string | null>(null);
  useEffect(() => { setGuestToken(getGuestToken(sessionId)); }, [sessionId]);

  // We don't actually know the role until we have a session. Until then, send
  // whichever credential the browser has. After the session arrives we can
  // confirm: host iff user.id === session.host.userId.
  const { session, error, loading, applySession } = useLiveTradeSession({
    sessionId,
    hostToken: token ?? null,
    guestToken,
  });

  const role: Role | null = useMemo(() => {
    if (!session) return null;
    if (user && user.id === session.host.userId) return 'host';
    if (guestToken) return 'guest';
    return null;
  }, [session, user, guestToken]);

  if (!hydrated || loading) {
    return <CenteredMessage>Loading session…</CenteredMessage>;
  }
  if (error) {
    return <CenteredMessage tone="error">{error}</CenteredMessage>;
  }
  if (!session) {
    return <CenteredMessage>This live-trade session no longer exists.</CenteredMessage>;
  }
  if (!role) {
    // Someone hit this URL without being either the host or the joined guest.
    // Bounce them to /join so they can enter the 6-digit code.
    return (
      <CenteredMessage>
        You need to join this session first.{' '}
        <button
          onClick={() => router.push(`/join?session=${sessionId}`)}
          className="text-[var(--cromo-accent)] underline"
        >
          Open join page
        </button>
      </CenteredMessage>
    );
  }

  return (
    <SessionRoom
      session={session}
      role={role}
      hostToken={token ?? null}
      guestToken={guestToken}
      onSession={applySession}
      onToast={addToast}
    />
  );
}

// ─── Room body ─────────────────────────────────────────────────────────────

interface SessionRoomProps {
  session: LiveTradeSession;
  role: Role;
  hostToken: string | null;
  guestToken: string | null;
  onSession: (s: LiveTradeSession) => void;
  onToast: ReturnType<typeof useToast>['addToast'];
}

function SessionRoom({
  session, role, hostToken, guestToken, onSession, onToast,
}: SessionRoomProps) {
  const router = useRouter();

  // "Edit list" toggle. When a side's list is empty, we open the editor by
  // default so the room shows something useful on first load.
  const myList = role === 'host' ? session.hostList : session.guestList;
  const theirList = role === 'host' ? session.guestList : session.hostList;
  const myStaged = role === 'host' ? session.hostStaged : session.guestStaged;
  const theirStaged = role === 'host' ? session.guestStaged : session.hostStaged;
  const myLocked = role === 'host' ? session.hostLocked : session.guestLocked;
  const theirLocked = role === 'host' ? session.guestLocked : session.hostLocked;
  const [editingList, setEditingList] = useState(myList.offered.length === 0 && myList.wanted.length === 0);

  const auth = role === 'host'
    ? { token: hostToken ?? undefined }
    : { guestToken: guestToken ?? undefined };

  // While the guest hasn't joined from their own device, the host drives the
  // guest's side too — enter their list, stage their pile, lock them in — all
  // from one phone (the account-less, co-located guest). The moment the guest
  // joins they claim their side and this proxy control drops away (the backend
  // rejects a host write to the guest side once `guest.joined` is true).
  const controllingGuest = role === 'host' && !session.guest.joined;
  const otherSide: Role = role === 'host' ? 'guest' : 'host';
  // The wire `side` arg is only needed when acting on the OTHER side (proxy);
  // for your own side it's omitted and the backend infers it from the principal.
  const sideArg = (side: Role): Role | undefined => (side === role ? undefined : side);

  const isCompleted = session.status === 'completed';
  const bothLocked = myLocked && theirLocked;

  // ── Mutations ──────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    try { return await fn(); }
    catch (err) {
      onToast(err instanceof Error ? err.message : `Could not ${label}.`, 'error');
      return null;
    } finally { setBusy(false); }
  }

  async function handleListChange(offered: ExternalListItem[], wanted: ExternalListItem[]) {
    // The list is always the guest's (the host's side is inventory-derived), so
    // both the guest and a proxying host POST it through the same endpoint.
    const next = await withBusy('save list', () => setLiveTradeList(session.id, { offered, wanted }, auth));
    if (next) onSession(next);
  }

  // Toggle a sticker in a side's staged pile. `side` is which pile to change —
  // your own, or (when proxying) the guest's.
  async function toggleStage(ref: LiveTradeStickerRef, side: Role) {
    const pile = side === 'host' ? session.hostStaged : session.guestStaged;
    const current = stagedQuantity(ref, pile);
    // Tap = toggle full quantity. The simplest possible interaction — long
    // press for a fractional pile is a follow-up if anyone asks.
    const nextPile = current > 0
      ? pile.filter((s) => s.stickerVariantId !== ref.stickerVariantId)
      : [...pile, { ...ref, quantity: ref.quantity }];
    const next = await withBusy('update pile', () => setLiveTradeStaged(
      session.id,
      nextPile.map((s) => ({ stickerVariantId: s.stickerVariantId, quantity: s.quantity })),
      auth,
      sideArg(side),
    ));
    if (next) onSession(next);
  }

  async function handleApplySuggestion() {
    if (!session.suggestion) return;
    // The suggestion has the host's give and receive piles. Normally each role
    // stages only their own side; a host proxying the absent guest stages both.
    const stageSide = (side: Role, pile: LiveTradeStickerRef[]) => setLiveTradeStaged(
      session.id,
      pile.map((s) => ({ stickerVariantId: s.stickerVariantId, quantity: s.quantity })),
      auth,
      sideArg(side),
    );
    const next = await withBusy('apply suggestion', async () => {
      if (role === 'host') {
        const afterHost = await stageSide('host', session.suggestion!.hostGives);
        return controllingGuest
          ? stageSide('guest', session.suggestion!.hostReceives)
          : afterHost;
      }
      return stageSide('guest', session.suggestion!.hostReceives);
    });
    if (next) onSession(next);
  }

  async function toggleLock(side: Role, locked: boolean) {
    const next = await withBusy('toggle lock', () => setLiveTradeLock(session.id, locked, auth, sideArg(side)));
    if (next) onSession(next);
  }

  async function handleComplete() {
    if (role !== 'host' || !hostToken) return;
    const next = await withBusy('complete trade', () => completeLiveTradeSession(session.id, hostToken));
    if (!next || !next.completion) return;
    onSession(next);
    // Toast with undo action and a 60s timer matching the server window.
    onToast('Trade complete. Your album is updated.', {
      type: 'success',
      durationMs: 60_000,
      action: {
        label: 'Undo',
        onClick: async () => {
          const undone = await withBusy('undo trade', () => undoLiveTradeSession(session.id, hostToken));
          if (undone) {
            onSession(undone);
            onToast('Trade reversed.', 'info');
          }
        },
      },
    });
  }

  async function handleUndo() {
    if (role !== 'host' || !hostToken) return;
    const next = await withBusy('undo trade', () => undoLiveTradeSession(session.id, hostToken));
    if (next) {
      onSession(next);
      onToast('Trade reversed.', 'info');
    }
  }

  async function handleSetWeights(weights: VariantWeights) {
    const next = await withBusy('update weights', () => setLiveTradeWeights(session.id, weights, auth));
    if (next) {
      onSession(next);
      onToast('Variant weights updated for this trade.', 'success');
    }
  }
  async function setCashForSide(cents: number, side: Role) {
    const next = await withBusy('update cash', () => setLiveTradeCash(session.id, cents, auth, sideArg(side)));
    if (next) onSession(next);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-8 pb-24 sm:pb-8">
      <Header session={session} role={role} onClose={() => router.push('/trade')} />

      <StatusBanner
        session={session}
        role={role}
        bothLocked={bothLocked}
        onComplete={handleComplete}
        onUndo={handleUndo}
        busy={busy}
      />

      {role === 'host' && <ShareCard session={session} />}

      {/* The guest's list is editable by the guest, or by the host while the
          guest hasn't joined (host drives the whole trade from one phone). */}
      {role === 'guest' || controllingGuest ? (
        editingList ? (
          <GuestListSection
            session={session}
            proxy={controllingGuest}
            onSubmit={handleListChange}
            onClose={() => setEditingList(false)}
            busy={busy}
          />
        ) : (
          <>
            {controllingGuest && (
              <p className="mb-2 text-xs text-[var(--cromo-fg-muted)]">
                Your trade partner hasn’t joined — you’re entering their side. If they
                open the join link, they take over their own list.
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditingList(true)}
              disabled={isCompleted}
              className="w-full mb-4 text-xs text-[var(--cromo-accent)] hover:underline disabled:opacity-50"
            >
              {(controllingGuest ? theirList : myList).offered.length === 0
                && (controllingGuest ? theirList : myList).wanted.length === 0
                ? (controllingGuest ? 'Tap to add their stickers' : 'Tap to add your stickers')
                : (controllingGuest ? 'Edit their list' : 'Edit your list')}
            </button>
          </>
        )
      ) : (
        <HostSideNote hasGuestList={theirList.offered.length > 0 || theirList.wanted.length > 0} />
      )}

      {session.suggestion && !isCompleted && !myLocked && (
        <SuggestionBanner
          session={session}
          role={role}
          onApply={handleApplySuggestion}
          busy={busy}
        />
      )}

      {!isCompleted && (
        <BalanceBar
          myStaged={myStaged}
          theirStaged={theirStaged}
          weights={session.activeWeights}
          myCashCents={role === 'host' ? session.hostCashCents : session.guestCashCents}
          theirCashCents={role === 'host' ? session.guestCashCents : session.hostCashCents}
          onSetMyCash={(cents) => setCashForSide(cents, role)}
          onSetTheirCash={controllingGuest ? (cents) => setCashForSide(cents, otherSide) : undefined}
          busy={busy}
        />
      )}

      {!isCompleted && (
        <WeightsSection
          session={session}
          role={role}
          onSetWeights={handleSetWeights}
          busy={busy}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StagingPanel
          title="Your side"
          subtitle={role === 'host'
            ? 'Tap a sticker to add to the pile you give them.'
            : 'Tap a sticker to add to the pile you give the host.'}
          items={myList.offered}
          staged={myStaged}
          locked={myLocked}
          disabled={isCompleted || busy}
          onToggle={(ref) => toggleStage(ref, role)}
        />
        <StagingPanel
          title="Their side"
          subtitle={controllingGuest
            ? 'Tap a sticker to add to the pile they give you.'
            : role === 'host'
              ? 'Stickers they will give you. Tap-to-stage is on their side.'
              : 'Stickers the host will give you.'}
          items={theirList.offered}
          staged={theirStaged}
          locked={theirLocked}
          disabled={isCompleted || busy || !controllingGuest}
          onToggle={controllingGuest ? (ref) => toggleStage(ref, otherSide) : () => undefined}
          readOnly={!controllingGuest}
        />
      </div>

      <LockBar
        role={role}
        session={session}
        controllingGuest={controllingGuest}
        myLocked={myLocked}
        theirLocked={theirLocked}
        myStagedCount={myStaged.length}
        theirStagedCount={theirStaged.length}
        onToggleLock={(locked) => toggleLock(role, locked)}
        onToggleTheirLock={(locked) => toggleLock(otherSide, locked)}
        busy={busy || isCompleted}
      />
    </div>
  );
}

// ─── Header & status ───────────────────────────────────────────────────────

function Header({ session, role, onClose }: {
  session: LiveTradeSession; role: Role; onClose: () => void;
}) {
  const hostName = session.host.displayName ?? session.host.username ?? 'Host';
  const guestName = session.guest.label ?? 'Guest';
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
          Live trade
        </p>
        <h1 className="text-base sm:text-lg font-semibold text-[var(--cromo-fg)] truncate">
          {hostName} <span className="text-[var(--cromo-fg-muted)] font-normal">↔</span> {guestName}
        </h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded ${
          role === 'host'
            ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
            : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]'
        }`}>
          {role === 'host' ? 'You · Host' : 'You · Guest'}
        </span>
        <button
          onClick={onClose}
          aria-label="Exit"
          className="text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] p-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function StatusBanner({
  session, role, bothLocked, onComplete, onUndo, busy,
}: {
  session: LiveTradeSession;
  role: Role;
  bothLocked: boolean;
  onComplete: () => void;
  onUndo: () => void;
  busy: boolean;
}) {
  if (session.status === 'completed' && session.completion) {
    return (
      <CompletionBanner
        completion={session.completion}
        role={role}
        onUndo={onUndo}
        busy={busy}
      />
    );
  }
  if (bothLocked && role === 'host') {
    return (
      <div className="mb-4 rounded-xl border border-[var(--cromo-success)]/40 bg-[var(--cromo-success-soft)] p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--cromo-success-text)]">
          Both sides are locked. Ready to commit?
        </p>
        <button
          onClick={onComplete}
          disabled={busy}
          className="rounded-md bg-[var(--cromo-success)] text-[var(--cromo-success-fg)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Complete trade
        </button>
      </div>
    );
  }
  if (bothLocked && role === 'guest') {
    return (
      <div className="mb-4 rounded-xl border border-[var(--cromo-success)]/40 bg-[var(--cromo-success-soft)] p-4">
        <p className="text-sm text-[var(--cromo-success-text)]">
          Both sides locked. Waiting for the host to commit the trade.
        </p>
      </div>
    );
  }
  return null;
}

function CompletionBanner({
  completion, role, onUndo, busy,
}: {
  completion: NonNullable<LiveTradeSession['completion']>;
  role: Role;
  onUndo: () => void;
  busy: boolean;
}) {
  // Tick once a second so the countdown rolls without the rest of the page
  // re-rendering on every animation frame.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const undone = completion.undoneAt !== null;
  const remainingSec = Math.max(0, Math.ceil((new Date(completion.undoExpiresAt).getTime() - now) / 1000));
  const canUndo = !undone && remainingSec > 0;

  return (
    <div className={`mb-4 rounded-xl border p-4 flex items-center justify-between gap-3 ${
      undone
        ? 'border-[var(--cromo-border)] bg-[var(--cromo-surface-2)]'
        : 'border-[var(--cromo-success)]/40 bg-[var(--cromo-success-soft)]'
    }`}>
      <p className="text-sm text-[var(--cromo-fg)]">
        {undone
          ? 'This trade was undone.'
          : <>Trade complete — your album is updated.{' '}
              {canUndo && role === 'host' && (
                <span className="text-[var(--cromo-fg-muted)]">
                  Undo available for {remainingSec}s.
                </span>
              )}
            </>}
      </p>
      {role === 'host' && canUndo && (
        <button
          onClick={onUndo}
          disabled={busy}
          className="shrink-0 rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-sm font-medium text-[var(--cromo-fg)] disabled:opacity-50"
        >
          Undo
        </button>
      )}
    </div>
  );
}

// ─── Share card (host only) ────────────────────────────────────────────────

function ShareCard({ session }: { session: LiveTradeSession }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  // We render the share card collapsed until the guest joins, then auto-hide
  // it — having the QR clutter the screen during the actual trading is noise.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (session.guest.joined) setDismissed(true);
  }, [session.guest.joined]);

  if (dismissed && session.guest.joined) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(session.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">
            {session.guest.joined ? 'Guest joined' : 'Waiting for your trade partner'}
          </h2>
          <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
            {session.guest.joined
              ? 'They\'re in. You can dismiss this and start staging.'
              : 'Share the code, link, or QR. They join at /join — no account needed.'}
          </p>
        </div>
        {session.guest.joined && (
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
          >
            Dismiss
          </button>
        )}
      </div>

      {!session.guest.joined && (
        <>
          <div className="mt-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="flex-1 rounded-lg bg-[var(--cromo-surface-2)] px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">Code</p>
              <p className="text-2xl font-mono tracking-widest text-[var(--cromo-fg)]">
                {session.joinCode.replace(/(\d{3})(\d{3})/, '$1 $2')}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:w-44">
              <button
                onClick={copyLink}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
              >
                {copied ? 'Link copied!' : 'Copy join link'}
              </button>
              <button
                onClick={() => setShowQr((q) => !q)}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
              >
                {showQr ? 'Hide QR' : 'Show QR'}
              </button>
            </div>
          </div>
          {showQr && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={session.joinUrl} size={196} />
              </div>
              <p className="text-[11px] font-mono text-[var(--cromo-fg-muted)] break-all text-center px-2">
                {session.joinUrl}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Host side note ─────────────────────────────────────────────────────────
// The host never types a list — their tradeable side is derived from their
// collection ∩ the guest's list, exactly like the async third-party flow.

function HostSideNote({ hasGuestList }: { hasGuestList: boolean }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-3">
      <p className="text-xs text-[var(--cromo-fg-muted)]">
        {hasGuestList
          ? 'Your side is built automatically from your collection — the stickers you can spare that they want. Tap the ones you’ll hand over below.'
          : 'Once your trade partner adds their stickers, we’ll match them against your collection and show what you can give and receive.'}
      </p>
    </div>
  );
}

// ─── Guest list editor ──────────────────────────────────────────────────────
// The guest seeds their list from text/photo, then refines it with structured
// rows (editable code, variant, and quantity). Only the guest has a typed list;
// the host's side is inventory-derived.

function GuestListSection({
  session, onSubmit, onClose, busy, proxy = false,
}: {
  session: LiveTradeSession;
  onSubmit: (offered: ExternalListItem[], wanted: ExternalListItem[]) => Promise<void>;
  onClose: () => void;
  busy: boolean;
  /** True when the HOST is entering the guest's list on the guest's behalf
   *  (guest hasn't joined). Flips the copy from "your"/"you" to "their"/"they". */
  proxy?: boolean;
}) {
  const [offered, setOffered] = useState<ExternalListItem[]>(
    () => session.guestList.offered.map(extToListItem),
  );
  const [wanted, setWanted] = useState<ExternalListItem[]>(
    () => session.guestList.wanted.map(extToListItem),
  );
  // The import textarea is a staging buffer, not a live merge: CombinedListInput
  // fires onChange on every keystroke, so we hold its parse here and only fold it
  // into the rows on an explicit "Add to list". `importKey` remounts the
  // (uncontrolled) textarea empty after a merge.
  const [importKey, setImportKey] = useState(0);
  const [importBuf, setImportBuf] = useState<{ offered: ExternalListItem[]; wanted: ExternalListItem[] }>(
    { offered: [], wanted: [] },
  );
  const [showImport, setShowImport] = useState(
    session.guestList.offered.length === 0 && session.guestList.wanted.length === 0,
  );

  const isEmpty = offered.length === 0 && wanted.length === 0;
  const importCount = importBuf.offered.length + importBuf.wanted.length;

  function addImport() {
    setOffered((cur) => mergeItems(cur, importBuf.offered));
    setWanted((cur) => mergeItems(cur, importBuf.wanted));
    setImportBuf({ offered: [], wanted: [] });
    setImportKey((k) => k + 1);
    setShowImport(false);
  }

  async function save() {
    // Fold any typed-but-not-yet-added import text in too, so a first-timer who
    // types a list and hits Save (without "Add to list") doesn't lose it. Drop
    // half-typed rows with no code so an empty tuple never reaches the API.
    const clean = (list: ExternalListItem[]) => list.filter((i) => i.albumCode.trim() !== '');
    await onSubmit(
      clean(mergeItems(offered, importBuf.offered)),
      clean(mergeItems(wanted, importBuf.wanted)),
    );
    onClose();
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">
          {proxy ? 'Their list' : 'Your list'}
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
        >
          Cancel
        </button>
      </div>

      <ListBucket
        title={proxy ? 'They have (offer)' : 'You have (offer)'}
        accent="success"
        items={offered}
        onChange={setOffered}
        emptyText={proxy ? 'Add the duplicates they’ll trade away.' : 'Add the duplicates you’ll trade away.'}
      />
      <ListBucket
        title={proxy ? 'They want' : 'You want'}
        accent="accent"
        items={wanted}
        onChange={setWanted}
        emptyText={proxy ? 'Add the stickers they’re looking for.' : 'Add the stickers you’re looking for.'}
      />

      <div className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-3">
        {showImport ? (
          <div className="space-y-2">
            <CombinedListInput
              key={importKey}
              label=""
              helper={isEmpty
                ? (proxy
                    ? 'Type their list, or snap a photo. Untagged codes count as what they WANT — add a HAVE: header for dupes they’ll trade away. Tag variants like BRA5(red).'
                    : 'Type your list, or snap a photo. Untagged codes count as what you WANT — add a HAVE: header for dupes you’ll trade away. Tag variants like BRA5(red).')
                : 'Add more — these merge into the lists above.'}
              offered={[]}
              wanted={[]}
              onChange={setImportBuf}
              albumTypeKey={session.host.albumTypeKey}
              defaultBucket="wanted"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setImportBuf({ offered: [], wanted: [] }); setImportKey((k) => k + 1); setShowImport(false); }}
                className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addImport}
                disabled={importCount === 0}
                className="rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {importCount > 0 ? `${importCount} ` : ''}to list
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="text-xs font-medium text-[var(--cromo-accent)] hover:underline"
          >
            + Paste a list or add a photo
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="w-full bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save list'}
      </button>
      <p className="text-[11px] text-[var(--cromo-fg-subtle)]">
        Codes are validated against the host’s album when you save.
      </p>
    </div>
  );
}

/** One editable bucket (offer or want) of structured rows. */
function ListBucket({
  title, accent, items, onChange, emptyText,
}: {
  title: string;
  accent: 'accent' | 'success';
  items: ExternalListItem[];
  onChange: (next: ExternalListItem[]) => void;
  emptyText: string;
}) {
  const tone = accent === 'success' ? 'text-[var(--cromo-success-text)]' : 'text-[var(--cromo-accent)]';
  function update(idx: number, patch: Partial<ExternalListItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...items, { albumCode: '', variantToken: null, quantity: 1 }]);
  }
  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${tone}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] py-1">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                value={it.albumCode}
                onChange={(e) => update(idx, { albumCode: e.target.value.toUpperCase().trim() })}
                placeholder="BRA5"
                aria-label="Album code"
                className="w-20 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
              />
              <select
                // Base is the empty-string option; a resolved base item carries
                // 'base_border'/'base_borderless', so map those back to "" or the
                // dropdown would render blank.
                value={isBaseToken(it.variantToken) ? '' : (it.variantToken ?? '')}
                onChange={(e) => update(idx, { variantToken: e.target.value || null })}
                aria-label="Variant"
                className="min-w-0 flex-1 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
              >
                <option value="">Base</option>
                {VARIANT_OPTIONS.map((t) => (
                  <option key={t} value={t}>{variantLabel(t)}</option>
                ))}
              </select>
              <div className="flex items-center rounded-md border border-[var(--cromo-border)]">
                <button
                  type="button"
                  onClick={() => update(idx, { quantity: Math.max(1, it.quantity - 1) })}
                  aria-label="Decrease quantity"
                  className="px-2 py-1 text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
                >
                  −
                </button>
                <span className="w-6 text-center text-xs tabular-nums">{it.quantity}</span>
                <button
                  type="button"
                  onClick={() => update(idx, { quantity: Math.min(99, it.quantity + 1) })}
                  aria-label="Increase quantity"
                  className="px-2 py-1 text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="Remove"
                className="px-1.5 py-1 text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-danger-text)]"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="mt-1.5 text-xs font-medium text-[var(--cromo-accent)] hover:underline"
      >
        + Add sticker
      </button>
    </div>
  );
}

function isBaseToken(token: string | null): boolean {
  return token === 'base_border' || token === 'base_borderless';
}

// Non-base variant tokens offered in the row selector, rarity-ordered. "Base"
// is the empty-string default; the backend maps it to the album's base variant.
const VARIANT_OPTIONS = ALL_VARIANT_TYPES
  .filter((t) => !isBaseToken(t))
  .sort(compareVariantTypes);

/** Merge new items into an existing bucket, summing quantity on the same
 *  code|variant key so an import doesn't create duplicate rows. */
function mergeItems(cur: ExternalListItem[], incoming: ExternalListItem[]): ExternalListItem[] {
  const keyOf = (i: ExternalListItem) => `${i.albumCode}|${i.variantToken ?? ''}`;
  const map = new Map<string, ExternalListItem>(cur.map((i) => [keyOf(i), i]));
  for (const i of incoming) {
    const existing = map.get(keyOf(i));
    map.set(keyOf(i), existing
      ? { ...existing, quantity: Math.min(99, existing.quantity + i.quantity) }
      : { ...i });
  }
  return [...map.values()];
}

function extToListItem(ref: LiveTradeStickerRef): ExternalListItem {
  return {
    albumCode: ref.albumCode,
    variantToken: ref.variantToken,
    quantity: ref.quantity,
  };
}

// ─── Balance bar ────────────────────────────────────────────────────────────
// Live scarcity balance over the STAGED piles + cash, from the caller's
// perspective (give = my pile, get = their pile). Mirrors the async
// third-party editor's fairness banner and cash "top-up" nudge.

function BalanceBar({
  myStaged, theirStaged, weights, myCashCents, theirCashCents, onSetMyCash, onSetTheirCash, busy,
}: {
  myStaged: LiveTradeStickerRef[];
  theirStaged: LiveTradeStickerRef[];
  weights: VariantWeights;
  myCashCents: number;
  theirCashCents: number;
  onSetMyCash: (cents: number) => void;
  /** When set (host proxying the absent guest), their cash is editable too. */
  onSetTheirCash?: (cents: number) => void;
  busy: boolean;
}) {
  // Cash is shared session state: setting it writes Redis, drops both locks, and
  // broadcasts over SSE. So we keep the field local while typing and only commit
  // on blur / Enter — never per keystroke, which would spam the socket and drop
  // locks on every digit.
  const [cashText, setCashText] = useState(() => centsToInput(myCashCents));
  useEffect(() => {
    if (parseCashCents(cashText || '0') !== myCashCents) setCashText(centsToInput(myCashCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCashCents]);

  const [theirCashText, setTheirCashText] = useState(() => centsToInput(theirCashCents));
  useEffect(() => {
    if (parseCashCents(theirCashText || '0') !== theirCashCents) setTheirCashText(centsToInput(theirCashCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theirCashCents]);

  function commitCash() {
    const cents = parseCashCents(cashText);
    if (cents !== myCashCents) onSetMyCash(cents);
  }
  function commitTheirCash() {
    if (!onSetTheirCash) return;
    const cents = parseCashCents(theirCashText);
    if (cents !== theirCashCents) onSetTheirCash(cents);
  }

  const balance = useMemo<ScarcityTotals>(
    () => computeScarcityBalance(myStaged, theirStaged, {
      weights,
      giveCashCents: myCashCents,
      getCashCents: theirCashCents,
    }),
    [myStaged, theirStaged, weights, myCashCents, theirCashCents],
  );

  const suggestion = useMemo(() => {
    const s = suggestBalancingCashCents(balance);
    // Only offer to top up MY side; the other party controls their own cash.
    return s && s.side === 'give' ? s : null;
  }, [balance]);

  const line = balanceLine(balance);

  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3 space-y-2">
      {line && (
        <div
          className={`rounded-md p-2.5 text-xs ${
            line.tone === 'warn'
              ? 'bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 text-amber-800'
              : 'bg-[var(--cromo-success-soft)] border border-[var(--cromo-success)]/30 text-[var(--cromo-success-text)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <span className="font-medium">{line.tone === 'warn' ? 'Lopsided — ' : 'Looks fair — '}</span>
              {line.text}
            </div>
            {suggestion && (
              <button
                type="button"
                onClick={() => onSetMyCash(myCashCents + suggestion.cents)}
                disabled={busy}
                className="shrink-0 rounded-md border border-[var(--cromo-warning)]/40 bg-[var(--cromo-surface)] px-2.5 py-1 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
              >
                Add ${fmtDollars(suggestion.cents)} from you
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--cromo-fg-subtle)]">Cash you add</span>
        <span className="text-xs text-[var(--cromo-fg-subtle)]">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cashText}
          disabled={busy}
          onChange={(e) => setCashText(e.target.value)}
          onBlur={commitCash}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitCash(); } }}
          placeholder="0.00"
          aria-label="Cash you add"
          className="w-20 rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
        />
        {onSetTheirCash ? (
          <>
            <span className="text-xs text-[var(--cromo-fg-subtle)]">· they add $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={theirCashText}
              disabled={busy}
              onChange={(e) => setTheirCashText(e.target.value)}
              onBlur={commitTheirCash}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTheirCash(); } }}
              placeholder="0.00"
              aria-label="Cash they add"
              className="w-20 rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
            />
          </>
        ) : theirCashCents > 0 && (
          <span className="text-xs text-[var(--cromo-fg-muted)]">· they add ${fmtDollars(theirCashCents)}</span>
        )}
      </div>
    </div>
  );
}

function fmtScarcity(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
}
function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
function centsToInput(cents: number): string {
  return cents > 0 ? fmtDollars(cents) : '';
}
function parseCashCents(value: string): number {
  const num = parseFloat(value);
  if (!isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function balanceLine(balance: ScarcityTotals): { tone: 'ok' | 'warn'; text: string } | null {
  if (balance.ratio === null) return null;
  if (balance.give === 0 && balance.get === 0) return null;
  if (balance.sameVariant) {
    return balance.lopsided
      ? { tone: 'warn', text: `Same-variant trade should be equal — you give ${fmtScarcity(balance.give)} and receive ${fmtScarcity(balance.get)}.` }
      : { tone: 'ok', text: `Same-variant swap — both sides exchange ${fmtScarcity(balance.give)}.` };
  }
  if (!balance.lopsided) {
    return { tone: 'ok', text: `You give ${fmtScarcity(balance.give)} value and receive ${fmtScarcity(balance.get)}.` };
  }
  const multiple = balance.ratio < 1 ? (1 / balance.ratio).toFixed(1) : balance.ratio.toFixed(1);
  return {
    tone: 'warn',
    text: `You give ${fmtScarcity(balance.give)} and receive ${fmtScarcity(balance.get)} — about ${multiple}× off.`,
  };
}

// ─── Suggestion banner ─────────────────────────────────────────────────────

function SuggestionBanner({
  session, role, onApply, busy,
}: {
  session: LiveTradeSession;
  role: Role;
  onApply: () => void;
  busy: boolean;
}) {
  if (!session.suggestion) return null;
  const myPile = role === 'host' ? session.suggestion.hostGives : session.suggestion.hostReceives;
  if (myPile.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent-soft)] p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--cromo-fg)]">
          Suggested swap available
        </p>
        <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
          We found {session.suggestion.hostGives.length + session.suggestion.hostReceives.length} stickers to swap. Tap to stage your side.
        </p>
      </div>
      <button
        onClick={onApply}
        disabled={busy}
        className="shrink-0 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        Stage
      </button>
    </div>
  );
}

// ─── Weights ────────────────────────────────────────────────────────────────
// The host sets the per-trade variant weight table directly (they own the album
// the trade commits to). The guest sees the active table read-only. Rows shown
// come from every variant present in either side's lists — no point weighting a
// token nobody's putting on the table.

function WeightsSection({
  session, role, onSetWeights, busy,
}: {
  session: LiveTradeSession;
  role: Role;
  onSetWeights: (weights: VariantWeights) => Promise<void>;
  busy: boolean;
}) {
  const presentVariants = useMemo(() => {
    const seen = new Set<string>();
    for (const list of [session.hostList, session.guestList]) {
      for (const r of [...list.offered, ...list.wanted]) {
        if (r.variantToken) seen.add(r.variantToken);
      }
    }
    return [...seen];
  }, [session.hostList, session.guestList]);

  if (presentVariants.length === 0) return null;

  if (role === 'guest') {
    const overrides = Object.entries(session.activeWeights ?? {});
    if (overrides.length === 0) return null;
    return (
      <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-3">
        <p className="text-sm font-semibold text-[var(--cromo-fg)]">Variant weights (set by the host)</p>
        <ul className="mt-2 grid gap-1 text-xs text-[var(--cromo-fg)]">
          {overrides.map(([token, value]) => (
            <li key={token} className="flex justify-between gap-2">
              <span className="truncate">{variantLabel(token)}</span>
              <span className="font-mono">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <WeightsEditor
        presentVariants={presentVariants}
        weights={session.activeWeights}
        onCommit={(weights) => onSetWeights(weights)}
        busy={busy}
        commitLabel="Apply"
        hint="Set the value of each variant for this trade. Both sides see the balance update; 0 means worthless."
      />
    </div>
  );
}

// ─── Staging panel ─────────────────────────────────────────────────────────

interface StagingPanelProps {
  title: string;
  subtitle: string;
  items: LiveTradeStickerRef[];
  staged: LiveTradeStickerRef[];
  locked: boolean;
  disabled: boolean;
  onToggle: (ref: LiveTradeStickerRef) => void;
  readOnly?: boolean;
}

function StagingPanel({
  title, subtitle, items, staged, locked, disabled, onToggle, readOnly,
}: StagingPanelProps) {
  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">{title}</h3>
          <p className="text-[11px] text-[var(--cromo-fg-muted)]">{subtitle}</p>
        </div>
        {locked && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]">
            Locked
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] py-6 text-center">
          Nothing to offer yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((ref) => {
            const qty = stagedQuantity(ref, staged);
            const isStaged = qty > 0;
            return (
              <li key={refKey(ref)}>
                <button
                  type="button"
                  onClick={() => onToggle(ref)}
                  disabled={disabled || readOnly}
                  className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    isStaged
                      ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] text-[var(--cromo-fg)]'
                      : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] text-[var(--cromo-fg)]'
                  } ${readOnly ? 'cursor-default' : 'active:scale-[0.99]'} disabled:opacity-60 disabled:cursor-not-allowed`}
                  aria-pressed={isStaged}
                  aria-label={`${refLabel(ref)}${isStaged ? ', staged' : ''}`}
                >
                  <span className="truncate">{refLabel(ref)}</span>
                  <span className="shrink-0 text-xs text-[var(--cromo-fg-muted)]">
                    {isStaged ? `✓ ×${qty}` : `×${ref.quantity}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Lock bar (sticky-ish footer) ──────────────────────────────────────────

function LockBar({
  role, session, controllingGuest, myLocked, theirLocked,
  myStagedCount, theirStagedCount, onToggleLock, onToggleTheirLock, busy,
}: {
  role: Role;
  session: LiveTradeSession;
  controllingGuest: boolean;
  myLocked: boolean;
  theirLocked: boolean;
  myStagedCount: number;
  theirStagedCount: number;
  onToggleLock: (locked: boolean) => void;
  onToggleTheirLock: (locked: boolean) => void;
  busy: boolean;
}) {
  if (session.status === 'completed') return null;
  const guestJoined = session.guest.joined;
  const otherName = role === 'host'
    ? (session.guest.label ?? 'the guest')
    : (session.host.displayName ?? session.host.username ?? 'the host');

  const shell = 'fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cromo-border)] bg-[var(--cromo-surface)]/95 backdrop-blur p-3 sm:static sm:z-auto sm:mt-4 sm:rounded-xl sm:border sm:bg-[var(--cromo-surface)] sm:p-4 sm:backdrop-blur-none';
  const lockBtn = (locked: boolean, label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
        locked
          ? 'border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg)]'
          : 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)]'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {locked ? 'Unlock' : label}
    </button>
  );

  // Host proxying the absent guest locks BOTH sides itself. Show two toggles.
  if (controllingGuest) {
    return (
      <div className={shell}>
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            {myLocked && theirLocked
              ? 'Both sides locked — commit the trade above.'
              : 'You’re entering both sides. Lock each when its pile is set.'}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center justify-between gap-2 rounded-md border border-[var(--cromo-border)] px-3 py-1.5">
              <span className="text-xs text-[var(--cromo-fg-muted)]">Your side</span>
              {lockBtn(myLocked, 'Ready', () => onToggleLock(!myLocked), busy || (!myLocked && myStagedCount === 0))}
            </div>
            <div className="flex-1 flex items-center justify-between gap-2 rounded-md border border-[var(--cromo-border)] px-3 py-1.5">
              <span className="text-xs text-[var(--cromo-fg-muted)]">Their side</span>
              {lockBtn(theirLocked, 'Ready', () => onToggleTheirLock(!theirLocked), busy || (!theirLocked && theirStagedCount === 0))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canLock = guestJoined && myStagedCount > 0;
  return (
    <div className={shell}>
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-[var(--cromo-fg-muted)]">
          {!guestJoined
            ? 'Waiting for your trade partner to join…'
            : myLocked && theirLocked
              ? 'Both sides locked.'
              : myLocked
                ? `Waiting on ${otherName} to lock.`
                : theirLocked
                  ? `${otherName} is ready.`
                  : 'Tap stickers to stage, then lock in.'}
        </div>
        {lockBtn(myLocked, 'I’m ready', () => onToggleLock(!myLocked), busy || (!myLocked && !canLock))}
      </div>
    </div>
  );
}

// ─── Misc ───────────────────────────────────────────────────────────────────

function CenteredMessage({
  children, tone = 'info',
}: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      <p className={`text-sm ${tone === 'error' ? 'text-[var(--cromo-danger-text)]' : 'text-[var(--cromo-fg-muted)]'}`}>
        {children}
      </p>
    </div>
  );
}
