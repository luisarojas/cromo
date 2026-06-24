'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/ToastProvider';
import {
  acceptLiveTradeWeights,
  completeLiveTradeSession,
  proposeLiveTradeWeights,
  rejectLiveTradeWeights,
  setLiveTradeList,
  setLiveTradeLock,
  setLiveTradeStaged,
  undoLiveTradeSession,
  type LiveTradeSession,
  type LiveTradeStickerRef,
  type ExternalListItem,
} from '@/lib/api';
import type { VariantWeights } from '@cromo/shared';
import { getGuestToken } from '@/lib/liveTradeStorage';
import CombinedListInput from '../../components/CombinedListInput';
import WeightsEditor from '../../components/WeightsEditor';
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
    const next = await withBusy('save list', () => setLiveTradeList(session.id, { offered, wanted }, auth));
    if (next) onSession(next);
  }

  async function handleToggleStage(ref: LiveTradeStickerRef) {
    const current = stagedQuantity(ref, myStaged);
    // Tap = toggle full quantity. The simplest possible interaction — long
    // press for a fractional pile is a follow-up if anyone asks.
    const nextStaged = current > 0
      ? myStaged.filter((s) => s.stickerVariantId !== ref.stickerVariantId)
      : [...myStaged, { ...ref, quantity: ref.quantity }];
    const next = await withBusy('update pile', () => setLiveTradeStaged(
      session.id,
      nextStaged.map((s) => ({ stickerVariantId: s.stickerVariantId, quantity: s.quantity })),
      auth,
    ));
    if (next) onSession(next);
  }

  async function handleApplySuggestion() {
    if (!session.suggestion) return;
    // The suggestion has the host's give and receive piles. Each role applies
    // their own side — host stages `hostGives`, guest stages `hostReceives`.
    const minePile = role === 'host' ? session.suggestion.hostGives : session.suggestion.hostReceives;
    const next = await withBusy('apply suggestion', () => setLiveTradeStaged(
      session.id,
      minePile.map((s) => ({ stickerVariantId: s.stickerVariantId, quantity: s.quantity })),
      auth,
    ));
    if (next) onSession(next);
  }

  async function handleToggleLock() {
    const next = await withBusy('toggle lock', () => setLiveTradeLock(session.id, !myLocked, auth));
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

  async function handleProposeWeights(weights: VariantWeights) {
    const next = await withBusy('send proposal', () => proposeLiveTradeWeights(session.id, weights, auth));
    if (next) onSession(next);
  }
  async function handleAcceptWeights() {
    const next = await withBusy('accept proposal', () => acceptLiveTradeWeights(session.id, auth));
    if (next) {
      onSession(next);
      onToast('Variant weights updated for this trade.', 'success');
    }
  }
  async function handleRejectWeights() {
    const next = await withBusy('reject proposal', () => rejectLiveTradeWeights(session.id, auth));
    if (next) onSession(next);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-8 pb-24">
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

      {editingList ? (
        <EditListSection
          session={session}
          role={role}
          onSubmit={handleListChange}
          onClose={() => setEditingList(false)}
          busy={busy}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingList(true)}
          disabled={isCompleted}
          className="w-full mb-4 text-xs text-[var(--cromo-accent)] hover:underline disabled:opacity-50"
        >
          {myList.offered.length === 0 && myList.wanted.length === 0
            ? 'Tap to add your list of stickers'
            : 'Edit your list'}
        </button>
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
        <WeightsNegotiation
          session={session}
          role={role}
          onPropose={handleProposeWeights}
          onAccept={handleAcceptWeights}
          onReject={handleRejectWeights}
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
          onToggle={handleToggleStage}
        />
        <StagingPanel
          title="Their side"
          subtitle={role === 'host'
            ? 'Stickers they will give you. Tap-to-stage is on their side.'
            : 'Stickers the host will give you.'}
          items={theirList.offered}
          staged={theirStaged}
          locked={theirLocked}
          disabled
          onToggle={() => undefined}
          readOnly
        />
      </div>

      <LockBar
        role={role}
        session={session}
        myLocked={myLocked}
        theirLocked={theirLocked}
        myStagedCount={myStaged.length}
        onToggleLock={handleToggleLock}
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

// ─── Edit-list section ─────────────────────────────────────────────────────

function EditListSection({
  session, role, onSubmit, onClose, busy,
}: {
  session: LiveTradeSession;
  role: Role;
  onSubmit: (offered: ExternalListItem[], wanted: ExternalListItem[]) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  // CombinedListInput is uncontrolled by props — it captures initial state
  // once and emits onChange. We mirror that with a local draft and a "Save"
  // button so the parent isn't pelted on every keystroke.
  const myList = role === 'host' ? session.hostList : session.guestList;
  const seed: { offered: ExternalListItem[]; wanted: ExternalListItem[] } = {
    offered: myList.offered.map(extToListItem),
    wanted: myList.wanted.map(extToListItem),
  };
  const [draft, setDraft] = useState(seed);

  async function save() {
    await onSubmit(draft.offered, draft.wanted);
    onClose();
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">
          {role === 'host' ? 'Your list' : 'Your list (codes only)'}
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
        >
          Cancel
        </button>
      </div>
      <CombinedListInput
        label=""
        helper="Type one or both lists, or snap a photo. Variants like (red) or (gold) are picked up."
        offered={draft.offered}
        wanted={draft.wanted}
        onChange={(next) => setDraft(next)}
        albumTypeKey={session.host.albumTypeKey}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-3 w-full bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save list'}
      </button>
      {session.host.albumTypeKey && (
        <p className="mt-2 text-[11px] text-[var(--cromo-fg-subtle)]">
          List is validated against the host’s album.
        </p>
      )}
    </div>
  );
}

function extToListItem(ref: LiveTradeStickerRef): ExternalListItem {
  return {
    albumCode: ref.albumCode,
    variantToken: ref.variantToken,
    quantity: ref.quantity,
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

// ─── Weights negotiation ───────────────────────────────────────────────────

/**
 * Per-trade variant weight handshake. The session carries an `activeWeights`
 * table (in effect now) and an optional `pendingWeightProposal` (sent by one
 * side, awaiting the other's accept/reject). Variant rows shown come from
 * every variant present in either side's lists — there's no point negotiating
 * a value for a token nobody's putting on the table.
 */
function WeightsNegotiation({
  session, role, onPropose, onAccept, onReject, busy,
}: {
  session: LiveTradeSession;
  role: Role;
  onPropose: (weights: VariantWeights) => Promise<void>;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
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

  const pending = session.pendingWeightProposal;
  const proposalIsMine = pending?.by === role;

  return (
    <div className="mb-4 space-y-3">
      {pending && (
        <div
          className={`rounded-xl border p-3 ${
            proposalIsMine
              ? 'border-[var(--cromo-border)] bg-[var(--cromo-surface-2)]'
              : 'border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent-soft)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--cromo-fg)]">
                {proposalIsMine
                  ? 'You proposed new variant weights'
                  : 'They proposed new variant weights'}
              </p>
              <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
                {proposalIsMine
                  ? 'Waiting for the other side to accept or reject.'
                  : 'Review the override and accept to apply them — locks reset on accept.'}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {proposalIsMine ? (
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy}
                  className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg)] disabled:opacity-50"
                >
                  Withdraw
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={busy}
                    className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg)] disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={onAccept}
                    disabled={busy}
                    className="rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50"
                  >
                    Accept
                  </button>
                </>
              )}
            </div>
          </div>
          <ul className="mt-2 grid gap-1 text-xs text-[var(--cromo-fg)]">
            {Object.entries(pending.weights).map(([token, value]) => (
              <li key={token} className="flex justify-between gap-2">
                <span className="truncate">{token}</span>
                <span className="font-mono">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <WeightsEditor
        presentVariants={presentVariants}
        weights={session.activeWeights}
        onCommit={(weights) => onPropose(weights)}
        busy={busy || !!pending}
        commitLabel="Propose"
        hint={
          pending
            ? 'A proposal is already on the table — resolve it before sending another.'
            : 'Propose a per-trade weight table. The other side must accept before it applies.'
        }
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
  role, session, myLocked, theirLocked, myStagedCount, onToggleLock, busy,
}: {
  role: Role;
  session: LiveTradeSession;
  myLocked: boolean;
  theirLocked: boolean;
  myStagedCount: number;
  onToggleLock: () => void;
  busy: boolean;
}) {
  if (session.status === 'completed') return null;
  const guestJoined = session.guest.joined;
  const canLock = guestJoined && myStagedCount > 0;
  const otherName = role === 'host'
    ? (session.guest.label ?? 'the guest')
    : (session.host.displayName ?? session.host.username ?? 'the host');

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cromo-border)] bg-[var(--cromo-surface)]/95 backdrop-blur p-3 sm:p-4">
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
        <button
          type="button"
          onClick={onToggleLock}
          disabled={busy || (!myLocked && !canLock)}
          className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            myLocked
              ? 'border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg)]'
              : 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {myLocked ? 'Unlock' : 'I’m ready'}
        </button>
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
