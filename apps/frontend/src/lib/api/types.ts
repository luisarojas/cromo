// Central re-exports of canonical wire types from @cromo/shared plus a few
// frontend-only constants/helpers other domain modules consume. Domain
// modules import from here so that the broader public surface
// (`@/lib/api`) stays a thin barrel.

export const DEFAULT_ALBUM_TYPE_KEY = 'fifa_world_cup_2026';

// Canonical wire types live in @cromo/shared so the backend (Drizzle schema,
// response shapes) and the frontend agree on names and casing.

// Bare-name types are re-exported straight from shared.
export type {
  AuthUser,
  UserAlbumWithStats,
  AlbumSettings,
  PagedResult,
  Sticker,
  StickerVariant,
  StickerLookup,
  StickerType,
  CollectionItem,
  MissingItem,
  DuplicateItem,
  VariantType,
  Position,
  TradeStatus,
  ListType,
  UserRole,
  City,
  UserPreferences,
  BaseVariantPreference,
  ProfileVisibility,
  TradeMatch,
  TradeItemDetail,
  TradeMessage,
  TradeSummary,
  TradeDetail,
  ShareLink,
  PublicListItem,
  PublicList,
  PublicInventoryItem,
  PublicProfileAlbum,
  PublicProfile,
  PublicWantedPage,
  ExternalListItem,
  ExternalStickerRef,
  MatchAgainstMeResult,
  MatchPairResult,
  ScanListResult,
  LiveTradeSession,
  LiveTradeStickerRef,
  LiveTradeHistorySummary,
  TradeHistoryItem,
  CreateLiveTradeResponse,
  JoinLiveTradeResponse,
  TradeInventoryVisibility,
} from '@cromo/shared';

// A handful of shared response shapes carry a `Dto` suffix to disambiguate
// from the Drizzle row types on the backend; the frontend doesn't see those,
// so we strip the suffix at the boundary.
import type {
  UserAlbumDto,
  AlbumStatsDto,
  CrossAlbumDto,
  CollectionStatsDto,
  FilterOptionsDto,
} from '@cromo/shared';
export type UserAlbum = UserAlbumDto;
export type AlbumStats = AlbumStatsDto;
export type CrossAlbum = CrossAlbumDto;
export type CollectionStats = CollectionStatsDto;
export type FilterOptions = FilterOptionsDto;

// camelizeKeys (backend serializer) converts dict keys too, so
// "north_america" → "northAmerica" inside teamPages/stickerPages.
export function toEditionKey(edition: string): string {
  return edition.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
