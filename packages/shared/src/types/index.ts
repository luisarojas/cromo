export type UserRole = 'user' | 'admin'
export type Locale = 'en' | 'es'

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
  collectionVisibility: 'private' | 'public' | 'friends'
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
  | 'museum'
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

export interface Sticker {
  id: string
  number: number
  albumCode: string
  teamId: string | null
  playerName: string | null
  position: Position | null
  stickerType: StickerType
  isFoil: boolean
  notes: string | null
}

export type VariantType =
  | 'base'
  | 'blue'
  | 'red'
  | 'purple'
  | 'green'
  | 'black_1of1'
  | 'orange_amazon'
  | 'gold_crumple'
  | 'blue_crumple'
  | 'red_crumple'
  | 'purple_crumple'
  | 'green_crumple'
  | 'black_crumple_1of1'
  | 'coca_cola'
  | 'extra_base'
  | 'extra_bronze'
  | 'extra_silver'
  | 'extra_gold'
  | 'swiss_gold'

export type Availability =
  | 'retail'
  | 'amazon_exclusive'
  | 'panini_online'
  | 'coca_cola'
  | 'swiss_edition'

export interface StickerVariant {
  id: string
  stickerId: string
  variantType: VariantType
  rarityRank: number
  availability: Availability
}

export interface UserSticker {
  id: string
  userId: string
  stickerVariantId: string
  quantity: number
  acquiredAt: string
}

export type TradeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'expired'

export interface TradeRequest {
  id: string
  requesterId: string
  recipientId: string
  status: TradeStatus
  counterCount: number
  offerCash: number
  wantCash: number
  acceptedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type TradeDirection = 'offer' | 'want'

export interface TradeItem {
  id: string
  tradeId: string
  stickerVariantId: string
  direction: TradeDirection
  quantity: number
}

export interface TradeMessage {
  id: string
  tradeId: string
  senderId: string
  body: string
  sentAt: string
}

export type ListType = 'missing' | 'duplicates' | 'full_collection'

export interface PublicList {
  id: string
  userId: string
  listType: ListType
  shareToken: string
  expiresAt: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
  total: number
}

export interface ApiError {
  statusCode: number
  error: string
  message: string
}
