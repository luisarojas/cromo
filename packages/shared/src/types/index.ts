export type UserRole = 'user' | 'admin'
export type Locale = 'en' | 'es'

export interface AlbumSettings {
  includeExtras: boolean
  includeCocaCola: boolean
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
  isTradeInventoryPublic: boolean
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
  albumCode: string
  playerName: string | null
  teamName: string | null
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
}

export interface UserPreferences {
  duplicatesCountAllVariants: boolean
  cities: City[]
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
  messageCount: number
}

export interface TradeDetail extends TradeSummary {
  items: TradeItemDetail[]
  messages: TradeMessage[]
  acceptedAt: string | null
  completedAt: string | null
  requesterCompletedAt: string | null
  recipientCompletedAt: string | null
  cancelledAt: string | null
  expiresAt: string | null
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
  variantType: string
  quantity: number | null
}

export interface PublicProfileAlbum {
  albumId: string
  albumTypeKey: string
  albumTypeName: string
  albumTypeGuidePath: string | null
  editionName: string
  formatName: string
  alias: string | null
  isDefault: boolean
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
