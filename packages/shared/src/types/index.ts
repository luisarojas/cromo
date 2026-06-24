export type UserRole = 'user' | 'admin'
export type Locale = 'en' | 'es'

export type BaseVariantPreference = 'base_border' | 'base_borderless'

export interface AlbumSettings {
  includeExtras: boolean
  includeCocaCola: boolean
  // Default Base variant the scanner pre-selects when the AI returns no
  // variantToken. The AI's own picks (including explicit base_border or
  // base_borderless) are preserved — this only fills the null case.
  defaultBaseVariant: BaseVariantPreference
}

export interface User {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  role: UserRole
  locale: Locale
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  userId: string
  profileVisibility: 'private' | 'public'
  tradeMatchingEnabled: boolean
  emailTradeRequests: boolean
  emailTradeMessages: boolean
  emailMarketing: boolean
  showTrustScorePublic: boolean
}

export type StickerType =
  | 'intro'
  | 'badge'
  | 'team_photo'
  | 'player'
  | 'coca_cola_special'
  | 'extra'

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export interface Team {
  id: string
  fifaCode: string
  name: string
  groupName: string
  flagUrl: string | null
}

export type VariantType =
  | 'base_border'
  | 'base_borderless'
  | 'blue'
  | 'red'
  | 'purple'
  | 'green'
  | 'black'
  | 'orange_amazon'
  | 'gold_crumple'
  | 'blue_crumple'
  | 'red_crumple'
  | 'purple_crumple'
  | 'green_crumple'
  | 'black_crumple'
  | 'extra_purple'
  | 'extra_bronze'
  | 'extra_silver'
  | 'extra_gold'
  | 'swiss_green'

export type Availability =
  | 'retail'
  | 'amazon_exclusive'
  | 'panini_online'
  | 'coca_cola'
  | 'swiss_edition'

export type TradeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'expired'

export type TradeDirection = 'offer' | 'want'

export type ListType = 'missing' | 'duplicates' | 'full_collection'

export interface ApiError {
  statusCode: number
  error: string
  message: string
  requestId?: string
}

// ─── Wire types shared between Fastify routes and the Next.js client ─────
// These describe the JSON the backend serializer (camelizeKeys) emits and the
// shapes the frontend consumes. They are the source of truth for both sides.

export interface AuthUser {
  id: string
  email: string
  username: string
  displayName: string | null
  role: string
  emailVerifiedAt: string | null
}

export interface UserAlbumDto {
  id: string
  userId: string
  albumTypeId: string
  albumTypeKey: string
  albumTypeName: string
  albumTypeGuidePath: string | null
  albumEditionId: string
  edition: string
  editionName: string
  albumFormatId: string
  format: string
  formatName: string
  alias: string | null
  notes: string | null
  isDefault: boolean
  settings: AlbumSettings
  tradeInventoryVisibility: TradeInventoryVisibility
  // Stable user-scoped slug used for `/profile/<u>/<slug>` URLs.
  slug: string
  createdAt: string
  updatedAt: string
}

export interface AlbumStatsDto {
  albumId: string
  total: number
  owned: number
  missing: number
  duplicates: number
  percentage: number
}

export interface UserAlbumWithStats extends UserAlbumDto {
  stats: AlbumStatsDto
}

// Cross-album indicators for a single "active" album.
// neededIn[code]   — other albums that do NOT yet own the code.
// availableIn[code] — other albums where the code has duplicates (qty > 1).
// presentIn[code]  — other albums that already own the code.
// All three are keyed by sticker album_code; values are the same {id, name}
// shape so the UI can render uniform "in <album>" chips.
export interface CrossAlbumAlbumRef {
  id: string
  name: string
}

export interface CrossAlbumDto {
  neededIn: Record<string, CrossAlbumAlbumRef[]>
  availableIn: Record<string, CrossAlbumAlbumRef[]>
  presentIn: Record<string, CrossAlbumAlbumRef[]>
}

export interface CollectionStatsDto {
  total: number
  owned: number
  missing: number
  duplicates: number
  percentage: number
}

export interface FilterOptionsDto {
  groups: string[]
  teams: { fifaCode: string; name: string }[]
  types: string[]
  variants: string[]
}

export interface PagedResult<T> {
  items: T[]
  nextCursor: number | null
  total: number
}

// Sticker as it appears on the wire — includes joined catalog data.
export interface Sticker {
  id: string
  number: number
  albumCode: string
  playerName: string | null
  position: string | null
  stickerType: string
  isFoil: boolean
  teamName: string | null
  fifaCode: string | null
  groupName: string | null
  baseVariantId: string | null
  teamPages: Record<string, [number, number]> | null
  stickerPages: Record<
    string,
    { pageStart: number | null; pageEnd: number | null; description: string | null }
  > | null
}

export interface StickerVariant {
  id: string
  stickerId: string
  variantType: string
  rarityRank: number
  availability: string
}

export interface StickerLookup {
  id: string
  albumCode: string
  playerName: string | null
  teamName: string | null
  fifaCode: string | null
  groupName: string | null
  variants: StickerVariant[]
}

export interface CollectionItem extends Sticker {
  userStickerId: string
  stickerVariantId: string
  variantType: string
  quantity: number
  tradeHidden: boolean
  tradeForced: boolean
}

export type MissingItem = Sticker

export interface DuplicateItem {
  userStickerId: string
  stickerVariantId: string
  variantType: string
  quantity: number
  number: number
  albumCode: string
  playerName: string | null
  stickerType: string
  isFoil: boolean
  teamName: string | null
  fifaCode: string | null
  groupName: string | null
}

export interface City {
  label: string
  placeId: number
  // Coordinates from Nominatim, used for radius filtering and the trade-page
  // map. Nullable so legacy rows written before the lat/lng columns existed
  // still parse — those rows are excluded from distance calculations.
  lat: number | null
  lng: number | null
}

export type ProfileVisibility = 'public' | 'private'

export const DEFAULT_SEARCH_RADIUS_KM = 50
export const MIN_SEARCH_RADIUS_KM = 5
export const MAX_SEARCH_RADIUS_KM = 1000

export interface UserPreferences {
  duplicatesCountAllVariants: boolean
  cities: City[]
  profileVisibility: ProfileVisibility
  tradeMatchingEnabled: boolean
  searchRadiusKm: number
  // Per-channel email opt-outs. Verification + password-reset bypass these.
  emailTradeRequests: boolean
  emailTradeMessages: boolean
  emailMarketing: boolean
}

// ─── Trade wire types ──────────────────────────────────────────────────────

export interface TradeMatch {
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  mutualOverlap: number
  theyHave: string[]
  theyHaveVariantIds: string[]
  youHave: string[]
  cities: City[]
  // Great-circle distance in km to the requester's nearest registered city.
  // null when either side has no geocoded city (no filter possible — the
  // candidate still shows up because the radius filter is skipped).
  distanceKm: number | null
}

export interface TradeItemDetail {
  id: string
  stickerVariantId: string
  variantType: string
  direction: TradeDirection
  quantity: number
  stickerNumber: number
  albumCode: string
  playerName: string | null
  stickerType: string
  teamName: string | null
}

export interface TradeMessage {
  id: string
  tradeId: string
  senderId: string | null
  senderUsername: string | null
  senderDisplayName: string | null
  body: string
  sentAt: string
  isSystem: boolean
}

export interface TradeSummary {
  /** Discriminator for the unified history list. Optional + 'request' default
   *  so existing consumers that don't narrow still type-check. */
  kind?: 'request'
  id: string
  requesterId: string
  requesterUsername: string
  recipientId: string
  recipientUsername: string
  status: TradeStatus
  counterCount: number
  offerCash: number
  wantCash: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
  messageCount: number
}

/**
 * Summary row for a live in-person trade in the unified history list. Carries
 * the enriched give/receive piles inline because no detail page exists — the
 * row IS the record. `status` collapses (undoneAt ?? completedAt) into one of
 * two outcomes so the existing status-filter logic on the list keeps working.
 */
export interface LiveTradeHistorySummary {
  kind: 'live'
  id: string
  hostUserId: string
  hostAlbumId: string
  /** Free-text label the host gave to the visitor (or null if never set). */
  guestLabel: string | null
  status: 'completed' | 'cancelled'
  hostGave: LiveTradeStickerRef[]
  hostReceived: LiveTradeStickerRef[]
  completedAt: string
  undoneAt: string | null
  /** Sort key for the unified history list: undoneAt ?? completedAt. */
  updatedAt: string
}

/** Discriminated union returned by the trade history endpoint. */
export type TradeHistoryItem = TradeSummary | LiveTradeHistorySummary

export interface TradeDetail extends TradeSummary {
  items: TradeItemDetail[]
  messages: TradeMessage[]
  acceptedAt: string | null
  ratingEligibleAt: string | null
  requesterCompletedAt: string | null
  recipientCompletedAt: string | null
  expiresAt: string | null
}

// ─── External list trade-matching (third-party / anonymous) ─────────────────
// Lightweight, ephemeral matching for two cases that don't involve a registered
// user collection on the "their" side:
//   1. A logged-in user pastes a friend's list and matches it against their own
//      collection (match-against-me).
//   2. An anonymous visitor pastes two lists and gets the optimal trade
//      between them (match-pair).
//
// Inputs are (albumCode, variantToken, quantity) tuples. Untagged codes are
// resolved to the album's base variant per region (NA → base_border, Intl →
// base_borderless, CC → coca_cola_special base, Extras → extra_purple). The
// VARIANT_SCARCITY table in @cromo/shared/constants weighs each variant so
// the result can flag lopsided trades.

/** A single line in a pasted offered/wanted list — code + optional variant + qty. */
export interface ExternalListItem {
  albumCode: string
  /** Canonical VariantType token, or null for "default base for this code". */
  variantToken: string | null
  /** Defaults to 1 when omitted in the input. */
  quantity: number
}

export interface ExternalStickerRef {
  albumCode: string
  playerName: string | null
  stickerType: StickerType | null
  number: number | null
  /** Resolved variant. Null means "the input didn't tag a variant and we
   *  couldn't resolve a default" — only happens for codes not in the catalog. */
  variantToken: string | null
  /** Human label for the variant (e.g. "Red", "Gold Crumple", "Extra · Gold").
   *  Localisable on the frontend; this is the English default. */
  variantLabel: string | null
  /** Resolved sticker_variants.id. Null when the code couldn't be resolved.
   *  Frontend uses this to commit a third-party trade execution back to the
   *  server without re-running the catalog lookup. */
  stickerVariantId: string | null
  /** Scarcity weight from VARIANT_SCARCITY. */
  scarcity: number
  quantity: number
}

export interface ExternalList {
  offered: string[]
  wanted: string[]
}

/** Aggregated scarcity totals for a single side of the trade. */
export interface ScarcityTotals {
  /** Sum of (scarcity × quantity) of stickers this side gives. */
  give: number
  /** Sum of (scarcity × quantity) of stickers this side receives. */
  get: number
  /** get / give, or null when give == 0 (no comparison possible). */
  ratio: number | null
  /** True when the ratio falls outside the TRADE_BALANCE band — UI surfaces
   *  this as a warning, never as an error. */
  lopsided: boolean
}

/** Result of matching a third-party list against the logged-in user. */
export interface MatchAgainstMeResult {
  /** Stickers the requester would receive (their offered ∩ my missing). */
  iGet: ExternalStickerRef[]
  /** Stickers the requester would give (their wanted ∩ my duplicates). */
  theyGet: ExternalStickerRef[]
  /** Codes/tokens from the input that could not be resolved against the catalog. */
  unknownCodes: string[]
  mutualOverlap: number
  /** Scarcity balance from the logged-in user's perspective:
   *   give = sum of `theyGet` scarcity, get = sum of `iGet` scarcity. */
  balance: ScarcityTotals
}

/** Result of matching two independent lists (anonymous pair flow). */
export interface MatchPairResult {
  /** Stickers Person A would receive (a.wanted ∩ b.offered). */
  aGets: ExternalStickerRef[]
  /** Stickers Person B would receive (b.wanted ∩ a.offered). */
  bGets: ExternalStickerRef[]
  unknownCodes: string[]
  mutualOverlap: number
  /** Balance from Person A's perspective. B's is its inverse — show only A's
   *  in the UI to avoid double-counting the same imbalance. */
  balance: ScarcityTotals
}

/**
 * Album codes extracted from a photo of a written/printed list, tagged by
 * which section they appeared under. A single list image may contain both
 * "what they have" and "what they want" separated by section headers; the
 * model splits them here so callers don't need a second pass.
 */
export interface ScanListResult {
  offered: string[]
  wanted: string[]
}

// ─── Live Trade wire types ─────────────────────────────────────────────────
// Two-sided in-person trade between a registered host and an anonymous guest.
// Session lives in Redis; only the completion (deltas applied to the host's
// inventory) is persisted, behind a 60s undo window. See
// services/live-trade.service.ts for invariants.

/** A staged or listed sticker — already resolved against the catalog, so it
 *  carries every field the room UI needs without an extra lookup. */
export interface LiveTradeStickerRef {
  /** Resolved sticker_variants.id — what gets written to user_stickers. */
  stickerVariantId: string
  albumCode: string
  playerName: string | null
  stickerType: StickerType | null
  number: number | null
  variantToken: string | null
  variantLabel: string | null
  scarcity: number
  quantity: number
}

/** Public snapshot of a live-trade session. Returned by every read/write
 *  endpoint and broadcast over SSE on every mutation. */
export interface LiveTradeSession {
  id: string
  joinCode: string
  joinUrl: string
  status: 'open' | 'completed'
  host: {
    userId: string
    username: string | null
    displayName: string | null
    albumId: string
    albumTypeKey: string
  }
  /** Guest is anonymous; label is whatever the host typed (or null until set). */
  guest: {
    /** True once a guest has joined the session via /join. */
    joined: boolean
    label: string | null
  }
  /** Items the host has typed/scanned but not yet committed to staging. */
  hostList: {
    offered: LiveTradeStickerRef[]
    wanted: LiveTradeStickerRef[]
    unknownCodes: string[]
  }
  guestList: {
    offered: LiveTradeStickerRef[]
    wanted: LiveTradeStickerRef[]
    unknownCodes: string[]
  }
  /** Locked-in pile each side will give. */
  hostStaged: LiveTradeStickerRef[]
  guestStaged: LiveTradeStickerRef[]
  hostLocked: boolean
  guestLocked: boolean
  /** Optimal swap derived from both lists — used to populate one-tap suggestions. */
  suggestion: {
    hostGives: LiveTradeStickerRef[]
    hostReceives: LiveTradeStickerRef[]
    balance: ScarcityTotals
  } | null
  /** Set when completion is applied. The 60-second undo window starts here. */
  completion: {
    id: string
    completedAt: string
    undoneAt: string | null
    /** Window end (completedAt + 60s) so the client can render a countdown
     *  without trusting its own clock for the start time. */
    undoExpiresAt: string
  } | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

/** Returned by POST /api/v1/live-trade — the host's view of a newly minted session. */
export interface CreateLiveTradeResponse {
  session: LiveTradeSession
}

/** Returned by POST /api/v1/live-trade/join — guest's first call. */
export interface JoinLiveTradeResponse {
  /** Bearer-style opaque token the guest sends on every subsequent call as
   *  `X-Live-Trade-Token`. Stored in the guest browser's session/localStorage. */
  guestToken: string
  session: LiveTradeSession
}

// ─── Sharing / public profile wire types ───────────────────────────────────

export interface ShareLink {
  id: string
  userId: string
  listType: ListType
  shareToken: string
  expiresAt: string | null
  createdAt: string
  url: string
}

export interface PublicListItem {
  stickerVariantId: string
  number: number
  albumCode: string
  playerName: string | null
  stickerType: string
  teamName: string | null
  variantType: string
  quantity?: number
}

export interface PublicList {
  owner: { username: string; displayName: string | null }
  listType: string
  items: PublicListItem[]
  createdAt: string
}

export interface PublicInventoryItem {
  stickerVariantId: string
  number: number
  albumCode: string
  playerName: string | null
  stickerType: string
  teamName: string | null
  fifaCode: string | null
  groupName: string | null
  variantType: string | null
  quantity: number | null
}

/**
 * Per-album trade-inventory visibility.
 *   private  — owner only; never appears on the public profile or the matchmaker.
 *   unlisted — accessible only via the per-album slug URL; hidden from listings
 *              and matchmaker (anyone with the slug can view).
 *   public   — listed on the user's public profile and discoverable by the
 *              trade matchmaker.
 */
export type TradeInventoryVisibility = 'private' | 'unlisted' | 'public'

export interface PublicProfileAlbum {
  albumId: string
  albumTypeKey: string
  albumTypeName: string
  albumTypeGuidePath: string | null
  editionName: string
  formatName: string
  alias: string | null
  isDefault: boolean
  // URL-safe identifier for `/profile/<u>/<slug>` deep links.
  slug: string
  // Always 'public' or 'unlisted' here — 'private' albums never reach this
  // type because they are filtered out server-side.
  tradeInventoryVisibility: Exclude<TradeInventoryVisibility, 'private'>
  offered: PublicInventoryItem[]
  wantedCount: number
}

export interface PublicProfile {
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  memberSince: string
  tradingInventory: PublicProfileAlbum[]
  tradingEnabled: boolean
}

export interface PublicInventoryFilterOptions {
  stickerTypes: string[]
  teams: string[]
  variantTypes: string[]
}

export interface PublicWantedPage {
  items: PublicInventoryItem[]
  nextCursor: number | null
  total: number
  filterOptions: PublicInventoryFilterOptions
}
