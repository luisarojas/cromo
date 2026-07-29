import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigserial,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  unique,
  check,
  foreignKey,
  primaryKey,
  inet,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  locale: text('locale').notNull().default('en'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  hashedEmail: text('hashed_email'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  roleCheck: check('users_role_check', sql`${table.role} IN ('user', 'admin')`),
  usernameLengthCheck: check('users_username_length', sql`char_length(${table.username}) BETWEEN 3 AND 30`),
  displayNameLengthCheck: check('users_display_name_length', sql`${table.displayName} IS NULL OR char_length(${table.displayName}) BETWEEN 1 AND 100`),
}));

// ─── album_types ──────────────────────────────────────────────────────────────

export const albumTypes = pgTable('album_types', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').unique().notNull(),
  name: text('name').notNull(),
  guidePath: text('guide_path'),
  scanPrompt: text('scan_prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── album_editions ───────────────────────────────────────────────────────────

export const albumEditions = pgTable('album_editions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  typeKeyUnique: unique('album_editions_album_type_id_key_unique').on(table.albumTypeId, table.key),
  // Composite uniqueness so user_albums can FK both columns together.
  idTypeUnique: unique('album_editions_id_album_type_id_unique').on(table.id, table.albumTypeId),
  albumTypeIdx: index('idx_album_editions_album_type_id').on(table.albumTypeId),
}));

// ─── album_formats ────────────────────────────────────────────────────────────
// Physical binding/material of the album (softcover, hardcover, etc.). Distinct
// from album_editions (which is the regional content variant). The available
// formats for a given edition are constrained via album_edition_formats.

export const albumFormats = pgTable('album_formats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  typeKeyUnique: unique('album_formats_album_type_id_key_unique').on(table.albumTypeId, table.key),
  idTypeUnique: unique('album_formats_id_album_type_id_unique').on(table.id, table.albumTypeId),
  albumTypeIdx: index('idx_album_formats_album_type_id').on(table.albumTypeId),
}));

// ─── album_edition_formats ────────────────────────────────────────────────────
// Junction table: which formats are available for each edition. Used so the
// UI can scope the format dropdown to the currently selected edition, and so
// user_albums can FK the (edition, format) pair to prevent illegal combos.

export const albumEditionFormats = pgTable('album_edition_formats', {
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id, { onDelete: 'cascade' }),
  albumEditionId: uuid('album_edition_id').notNull(),
  albumFormatId: uuid('album_format_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.albumEditionId, table.albumFormatId] }),
  editionIdx: index('idx_album_edition_formats_edition_id').on(table.albumEditionId),
  formatIdx: index('idx_album_edition_formats_format_id').on(table.albumFormatId),
  typeIdx: index('idx_album_edition_formats_type_id').on(table.albumTypeId),
  // Composite FKs prove the edition and format both belong to the same type.
  editionMatchesType: foreignKey({
    name: 'album_edition_formats_edition_matches_type',
    columns: [table.albumEditionId, table.albumTypeId],
    foreignColumns: [albumEditions.id, albumEditions.albumTypeId],
  }).onDelete('cascade'),
  formatMatchesType: foreignKey({
    name: 'album_edition_formats_format_matches_type',
    columns: [table.albumFormatId, table.albumTypeId],
    foreignColumns: [albumFormats.id, albumFormats.albumTypeId],
  }).onDelete('cascade'),
}));

// ─── user_albums ──────────────────────────────────────────────────────────────

import type { AlbumSettings } from '@cromo/shared';

const DEFAULT_ALBUM_SETTINGS: AlbumSettings = {
  includeExtras: true,
  includeCocaCola: true,
  // base_borderless is the common case globally (international packs); NA users
  // can flip to base_border in the album edit modal. Album-create paths that
  // know the edition should choose deliberately instead of relying on this.
  defaultBaseVariant: 'base_borderless',
  duplicatesCountAllVariants: true,
};

export type { AlbumSettings };

export const userAlbums = pgTable('user_albums', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id),
  albumEditionId: uuid('album_edition_id').notNull(),
  albumFormatId: uuid('album_format_id').notNull(),
  alias: text('alias'),
  notes: text('notes'),
  isDefault: boolean('is_default').notNull().default(false),
  settings: jsonb('settings').$type<AlbumSettings>().notNull().default(DEFAULT_ALBUM_SETTINGS),
  // 'private' (owner only, default), 'unlisted' (accessible only with a
  // direct per-album URL), or 'public' (listed on the user's profile and
  // included in trade-matchmaking). See migration 0022 and the share-
  // privacy notes in CLAUDE.md.
  tradeInventoryVisibility: text('trade_inventory_visibility').notNull().default('private'),
  // Stable user-scoped slug for `/profile/<u>/<slug>` URLs. Generated at
  // create-time from album_type_key/edition_key/format_key with a -N
  // suffix on collision. Format-checked in SQL; never edit directly.
  slug: text('slug').notNull(),
  ownedCount: integer('owned_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  totalCount: integer('total_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index('idx_user_albums_user_id').on(table.userId),
  // Enforce one default album per user at the storage layer so a logic bug
  // can't quietly produce two defaults.
  oneDefaultPerUser: uniqueIndex('user_albums_one_default_per_user')
    .on(table.userId)
    .where(sql`is_default`),
  albumTypeIdx: index('idx_user_albums_album_type_id').on(table.albumTypeId),
  albumEditionIdx: index('idx_user_albums_album_edition_id').on(table.albumEditionId),
  albumFormatIdx: index('idx_user_albums_album_format_id').on(table.albumFormatId),
  tradeInventoryVisibilityIdx: index('idx_user_albums_trade_inventory_visibility')
    .on(table.userId, table.tradeInventoryVisibility)
    .where(sql`trade_inventory_visibility != 'private'`),
  visibilityCheck: check(
    'user_albums_trade_inventory_visibility_check',
    sql`${table.tradeInventoryVisibility} IN ('private', 'unlisted', 'public')`,
  ),
  slugUnique: unique('user_albums_user_id_slug_unique').on(table.userId, table.slug),
  slugFormatCheck: check(
    'user_albums_slug_format_check',
    sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'`,
  ),
  aliasLengthCheck: check('user_albums_alias_length', sql`${table.alias} IS NULL OR (char_length(${table.alias}) BETWEEN 1 AND 100)`),
  notesLengthCheck: check('user_albums_notes_length', sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 500`),
  // Composite FK ensures the chosen edition belongs to the chosen album type.
  editionMatchesType: foreignKey({
    name: 'user_albums_edition_matches_type',
    columns: [table.albumEditionId, table.albumTypeId],
    foreignColumns: [albumEditions.id, albumEditions.albumTypeId],
  }),
  // Composite FK ensures the chosen format belongs to the chosen album type.
  formatMatchesType: foreignKey({
    name: 'user_albums_format_matches_type',
    columns: [table.albumFormatId, table.albumTypeId],
    foreignColumns: [albumFormats.id, albumFormats.albumTypeId],
  }),
  // Composite FK ensures the (edition, format) pair is a valid combination
  // per album_edition_formats. E.g. a North American edition cannot pick the
  // Switzerland-only "metallised softcover" format.
  editionFormatValid: foreignKey({
    name: 'user_albums_edition_format_valid',
    columns: [table.albumEditionId, table.albumFormatId],
    foreignColumns: [albumEditionFormats.albumEditionId, albumEditionFormats.albumFormatId],
  }),
}));

// ─── user_settings ────────────────────────────────────────────────────────────

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  profileVisibility: text('profile_visibility').notNull().default('public'),
  tradeMatchingEnabled: boolean('trade_matching_enabled').notNull().default(true),
  emailTradeRequests: boolean('email_trade_requests').notNull().default(true),
  emailTradeMessages: boolean('email_trade_messages').notNull().default(true),
  emailMarketing: boolean('email_marketing').notNull().default(false),
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
  marketingConsentVersion: text('marketing_consent_version'),
  showTrustScorePublic: boolean('show_trust_score_public').notNull().default(true),
  cities: jsonb('cities').$type<{ label: string; placeId: number; lat: number | null; lng: number | null }[]>().notNull().default(sql`'[]'::jsonb`),
  // Radius (km) for the "find trades" filter. Bounded to keep the
  // distance-priority weight meaningful; the UI clamps the slider.
  searchRadiusKm: integer('search_radius_km').notNull().default(50),
}, (table) => ({
  profileVisibilityCheck: check('user_settings_profile_visibility_check', sql`${table.profileVisibility} IN ('private', 'public')`),
  searchRadiusCheck: check('user_settings_search_radius_check', sql`${table.searchRadiusKm} BETWEEN 5 AND 1000`),
}));

// ─── consent_records ──────────────────────────────────────────────────────────

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  consentType: text('consent_type').notNull(),
  granted: boolean('granted').notNull(),
  policyVersion: text('policy_version').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userTypeIdx: index('idx_consent_records_user_id_type').on(table.userId, table.consentType),
}));

// ─── email_suppressions ──────────────────────────────────────────────────────
// Addresses we will never send to again. Populated automatically from SES
// bounce/complaint events delivered via SES → SNS → SQS → the poller in
// services/ses-poller.service.ts. The email sender checks this table before
// every send and skips suppressed recipients — this is the primary protection
// against the bounce/complaint rates that get SES senders throttled or paused.

export const emailSuppressions = pgTable('email_suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  bounceType: text('bounce_type'),
  bounceSubtype: text('bounce_subtype'),
  diagnosticCode: text('diagnostic_code'),
  notificationPayload: jsonb('notification_payload'),
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  reasonCheck: check('email_suppressions_reason_check', sql`${table.reason} IN ('bounce', 'complaint', 'manual')`),
  suppressedAtIdx: index('idx_email_suppressions_suppressed_at').on(table.suppressedAt),
}));

// ─── email_verification_tokens ────────────────────────────────────────────────

// Token at rest is SHA-256(cleartext). The cleartext only exists in the
// outgoing email link; even a DB read can't yield a usable token.
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(
    sql`now() + INTERVAL '24 hours'`
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index('idx_email_verification_tokens_user_id').on(table.userId),
}));

// ─── teams ────────────────────────────────────────────────────────────────────

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fifaCode: text('fifa_code').unique().notNull(),
  name: text('name').notNull(),
  groupName: text('group_name').notNull(),
  // Denormalized { edition: [pageStart, pageEnd] } map. Kept fresh by
  // trg_team_album_pages_sync. Lets the collection read path skip the
  // per-team STABLE function call.
  pages: jsonb('pages').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── stickers ─────────────────────────────────────────────────────────────────

export const stickers = pgTable('stickers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id),
  number: integer('number').notNull(),
  albumCode: text('album_code').notNull(),
  teamId: uuid('team_id').references(() => teams.id),
  playerName: text('player_name'),
  position: text('position'),
  stickerType: text('sticker_type').notNull(),
  isFoil: boolean('is_foil').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  albumTypeNumberUnique: unique('stickers_album_type_id_number_unique').on(table.albumTypeId, table.number),
  albumTypeIdx: index('idx_stickers_album_type_id').on(table.albumTypeId),
  // Composite (album_type_id, album_code) supports the Coca-Cola widening in
  // getTradeMatches, which joins stickers by album_code within an album_type
  // to treat regional CC alternates as a single slot. album_code is not unique
  // (CC slots have multiple alternates) so a plain unique constraint won't do.
  albumTypeCodeIdx: index('idx_stickers_album_type_id_album_code').on(table.albumTypeId, table.albumCode),
  teamIdx: index('idx_stickers_team_id').on(table.teamId),
  numberCheck: check('stickers_number_check', sql`${table.number} BETWEEN 0 AND 9999`),
}));

// ─── sticker_album_pages ──────────────────────────────────────────────────────

export const stickerAlbumPages = pgTable('sticker_album_pages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'cascade' }),
  edition: text('edition').notNull(),
  pageStart: integer('page_start'),
  pageEnd: integer('page_end'),
  description: text('description'),
}, (table) => ({
  stickerEditionUnique: unique('sticker_album_pages_sticker_id_edition_unique').on(table.stickerId, table.edition),
  stickerIdIdx: index('idx_sticker_album_pages_sticker_id').on(table.stickerId),
}));

// ─── team_album_pages ─────────────────────────────────────────────────────────

export const teamAlbumPages = pgTable('team_album_pages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  edition: text('edition').notNull(),
  pageStart: integer('page_start').notNull(),
  pageEnd: integer('page_end').notNull(),
}, (table) => ({
  teamEditionUnique: unique('team_album_pages_team_id_edition_unique').on(table.teamId, table.edition),
  teamIdIdx: index('idx_team_album_pages_team_id').on(table.teamId),
}));

// ─── sticker_variants ─────────────────────────────────────────────────────────

export const stickerVariants = pgTable('sticker_variants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id),
  variantType: text('variant_type').notNull(),
  rarityRank: integer('rarity_rank').notNull(),
  availability: text('availability').notNull(),
}, (table) => ({
  stickerVariantUnique: uniqueIndex('sticker_variants_sticker_id_variant_type_unique').on(
    table.stickerId,
    table.variantType
  ),
  stickerIdx: index('idx_sticker_variants_sticker_id').on(table.stickerId),
}));

// ─── user_stickers ────────────────────────────────────────────────────────────

export const userStickers = pgTable('user_stickers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  albumId: uuid('album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade' }),
  stickerVariantId: uuid('sticker_variant_id').notNull().references(() => stickerVariants.id),
  quantity: integer('quantity').notNull().default(1),
  tradeHidden: boolean('trade_hidden').notNull().default(false),
  tradeForced: boolean('trade_forced').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  albumVariantUnique: uniqueIndex('user_stickers_album_id_sticker_variant_id_unique').on(
    table.albumId,
    table.stickerVariantId
  ),
  stickerVariantIdx: index('idx_user_stickers_sticker_variant_id').on(table.stickerVariantId),
  duplicatesIdx: index('idx_user_stickers_duplicates').on(table.albumId).where(sql`quantity > 1`),
  quantityCheck: check('user_stickers_quantity_check', sql`${table.quantity} >= 0`),
}));

// ─── user_sticker_favourites ──────────────────────────────────────────────────

export const userStickerFavourites = pgTable('user_sticker_favourites', {
  albumId: uuid('album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade' }),
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: uniqueIndex('user_sticker_favourites_pkey').on(table.albumId, table.stickerId),
  albumIdx: index('idx_user_sticker_favourites_album_id').on(table.albumId),
}));

// ─── user_wanted_variants ─────────────────────────────────────────────────────

export const userWantedVariants = pgTable('user_wanted_variants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  stickerVariantId: uuid('sticker_variant_id').notNull().references(() => stickerVariants.id),
  albumId: uuid('album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userVariantAlbumUnique: unique('user_wanted_variants_user_id_sticker_variant_id_album_id_key')
    .on(table.userId, table.stickerVariantId, table.albumId),
  userAlbumIdx: index('idx_user_wanted_variants_user_album').on(table.userId, table.albumId),
}));

// ─── trade_requests ───────────────────────────────────────────────────────────

export const tradeRequests = pgTable('trade_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  requesterAlbumId: uuid('requester_album_id').notNull().references(() => userAlbums.id),
  recipientAlbumId: uuid('recipient_album_id').notNull().references(() => userAlbums.id),
  status: text('status').notNull().default('pending'),
  counterCount: integer('counter_count').notNull().default(0),
  offerCash: integer('offer_cash').notNull().default(0),
  wantCash: integer('want_cash').notNull().default(0),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  ratingEligibleAt: timestamp('rating_eligible_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  requesterCompletedAt: timestamp('requester_completed_at', { withTimezone: true }),
  recipientCompletedAt: timestamp('recipient_completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // Most recent time the rating-reminder cron emitted any reminder for this
  // trade. Re-checked by the cron to avoid re-sending the same reminder
  // every 24h until the 14-day rating window closes — see jobs/handlers.ts.
  lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  statusCheck: check(
    'trade_requests_status_check',
    sql`${table.status} IN ('pending','accepted','declined','cancelled','completed','expired')`
  ),
  counterCheck: check(
    'trade_requests_counter_count_check',
    sql`${table.counterCount} BETWEEN 0 AND 5`
  ),
  offerCashCheck: check(
    'trade_requests_offer_cash_check',
    sql`${table.offerCash} >= 0`
  ),
  wantCashCheck: check(
    'trade_requests_want_cash_check',
    sql`${table.wantCash} >= 0`
  ),
  requesterStatusUpdatedIdx: index('idx_trade_requests_requester_status_updated')
    .on(table.requesterId, table.status, table.updatedAt.desc()),
  recipientStatusUpdatedIdx: index('idx_trade_requests_recipient_status_updated')
    .on(table.recipientId, table.status, table.updatedAt.desc()),
}));

// ─── trade_items ──────────────────────────────────────────────────────────────

export const tradeItems = pgTable('trade_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  stickerVariantId: uuid('sticker_variant_id').notNull().references(() => stickerVariants.id),
  direction: text('direction').notNull(),
  quantity: integer('quantity').notNull().default(1),
}, (table) => ({
  quantityCheck: check('trade_items_quantity_check', sql`${table.quantity} > 0`),
  tradeIdIdx: index('idx_trade_items_trade_id').on(table.tradeId),
  variantIdIdx: index('idx_trade_items_sticker_variant_id').on(table.stickerVariantId),
}));

// ─── trade_messages ───────────────────────────────────────────────────────────

export const tradeMessages = pgTable('trade_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  body: text('body').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  tradeIdIdx: index('idx_trade_messages_trade_id').on(table.tradeId, table.sentAt),
  bodyCheck: check('trade_messages_body_check', sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
}));

// ─── push_subscriptions ───────────────────────────────────────────────────────
// Web Push (VAPID) endpoints per user device. A user can have multiple rows
// (phone + laptop + tablet).

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userEndpointUnique: unique('push_subscriptions_user_id_endpoint_key').on(table.userId, table.endpoint),
  userIdIdx: index('idx_push_subscriptions_user_id').on(table.userId),
}));

// ─── public_lists ─────────────────────────────────────────────────────────────

export const publicLists = pgTable('public_lists', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  listType: text('list_type').notNull(),
  shareToken: text('share_token').unique().notNull().$defaultFn(
    () => crypto.randomBytes(16).toString('hex')
  ),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── password_reset_tokens ────────────────────────────────────────────────────

// See emailVerificationTokens for the at-rest hashing rationale.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(
    sql`now() + INTERVAL '1 hour'`
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index('idx_password_reset_tokens_user_id').on(table.userId),
}));

// ─── feature_flags ────────────────────────────────────────────────────────────

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPct: integer('rollout_pct').notNull().default(0),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  rolloutCheck: check('feature_flags_rollout_pct_check', sql`${table.rolloutPct} BETWEEN 0 AND 100`),
}));

// ─── audit_log ────────────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  action: text('action').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userOccurredIdx: index('idx_audit_log_user_id_occurred_at').on(table.userId, table.occurredAt.desc()),
}));

// ─── trade_ratings ────────────────────────────────────────────────────────────

export const tradeRatings = pgTable('trade_ratings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  raterId: uuid('rater_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ratedUserId: uuid('rated_user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  isPositive: boolean('is_positive').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  tradeRaterUnique: uniqueIndex('trade_ratings_trade_id_rater_id_unique').on(
    table.tradeId,
    table.raterId
  ),
  ratedUserIdx: index('idx_trade_ratings_rated_user_id').on(table.ratedUserId),
  commentCheck: check('trade_ratings_comment_check', sql`char_length(${table.comment}) <= 500`),
  raterCheck: check('trade_ratings_rater_check', sql`${table.raterId} <> ${table.ratedUserId}`),
}));

// ─── user_reports ─────────────────────────────────────────────────────────────

export const userReports = pgTable('user_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  reportedUserId: uuid('reported_user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  tradeId: uuid('trade_id').references(() => tradeRequests.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('open'),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  categoryCheck: check(
    'user_reports_category_check',
    sql`${table.category} IN ('harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other')`
  ),
  statusCheck: check(
    'user_reports_status_check',
    sql`${table.status} IN ('open','under_review','resolved','dismissed')`
  ),
  descriptionCheck: check(
    'user_reports_description_check',
    sql`char_length(${table.description}) BETWEEN 10 AND 2000`
  ),
  resolutionNoteCheck: check(
    'user_reports_resolution_note_check',
    sql`char_length(${table.resolutionNote}) <= 1000`
  ),
  reporterCheck: check(
    'user_reports_reporter_check',
    sql`${table.reporterId} <> ${table.reportedUserId}`
  ),
  reportedStatusIdx: index('idx_user_reports_reported_user_id_status').on(table.reportedUserId, table.status),
}));

// ─── report_message_refs ─────────────────────────────────────────────────────
// Chat messages from the linked trade that the reporter cited as evidence.

export const reportMessageRefs = pgTable('report_message_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => userReports.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  messageId: uuid('message_id').notNull().references(() => tradeMessages.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  reportMessageUnique: unique('report_message_refs_report_id_message_id_key').on(table.reportId, table.messageId),
  reportIdx: index('idx_report_message_refs_report_id').on(table.reportId),
}));

// ─── report_attachments ───────────────────────────────────────────────────────
// Image evidence uploaded with a report. Admin-only visibility.

export const reportAttachments = pgTable('report_attachments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => userReports.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  reportIdx: index('idx_report_attachments_report_id').on(table.reportId),
}));

// ─── user_bans ────────────────────────────────────────────────────────────────

export const userBans = pgTable('user_bans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  banType: text('ban_type').notNull(),
  reason: text('reason').notNull(),
  reportId: uuid('report_id').references(() => userReports.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  bannedBy: uuid('banned_by').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: uuid('lifted_by').references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  liftReason: text('lift_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  banTypeCheck: check('user_bans_ban_type_check', sql`${table.banType} IN ('soft','hard')`),
  reasonCheck: check('user_bans_reason_check', sql`char_length(${table.reason}) BETWEEN 5 AND 1000`),
  liftReasonCheck: check('user_bans_lift_reason_check', sql`char_length(${table.liftReason}) <= 500`),
}));

// ─── banned_emails ────────────────────────────────────────────────────────────
// Persists blocked email hashes across user-row deletion. No FK to users so
// entries survive the 14-day hard-delete purge.

export const bannedEmails = pgTable('banned_emails', {
  hashedEmail: text('hashed_email').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid('created_by'),
});

// ─── trade_invites ────────────────────────────────────────────────────────────
// Single-use, short-lived link a collector can hand to someone in person
// (via QR code or shared URL) to drop the scanner into the existing
// propose-trade flow with this user pre-selected as the partner. The
// scanner authenticates, POSTs /api/v1/trade/invites/:token/redeem, and
// is redirected to the same `/trade?tab=find&recipient=<username>` entry
// the profile's "Start a trade" button uses. Tokens default to a 30-min
// TTL and are consumed atomically — once `redeemed_at` is set, further
// redemptions return 409.

export const tradeInvites = pgTable('trade_invites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '30 minutes'`),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  redeemedByUserId: uuid('redeemed_by_user_id').references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  hostIdx: index('idx_trade_invites_host_user_id').on(table.hostUserId),
  expiresIdx: index('idx_trade_invites_expires_at').on(table.expiresAt),
}));

// ─── live_trade_completions ───────────────────────────────────────────────────
// Host-only history of in-person live trades with a non-registered visitor.
// The session itself lives in Redis (ephemeral, two-sided staging + lock); the
// only thing we persist is what changed on the host's side at "complete" time
// so we can show it in trade history and reverse it inside a 60s undo window.
//
// `host_gave` / `host_received` are JSONB arrays of `{stickerVariantId, quantity}`
// — the exact deltas applied to user_stickers — so undo can reverse them without
// re-resolving the catalog. Once `undone_at` is set, the row stays for audit
// but no further mutation is possible.

export const liveTradeCompletions = pgTable('live_trade_completions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  hostAlbumId: uuid('host_album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Discriminates the two flows that share this table: 'live' = an in-person
  // Live Room session (two-sided staging over Redis), 'third_party' = a trade
  // the user logged after executing it off-platform. History rendering keys the
  // "Live" badge off this so third-party trades aren't mislabelled as live.
  source: text('source').notNull().default('live'),
  guestLabel: text('guest_label'),
  hostGave: jsonb('host_gave').$type<{ stickerVariantId: string; quantity: number }[]>().notNull().default(sql`'[]'::jsonb`),
  hostReceived: jsonb('host_received').$type<{ stickerVariantId: string; quantity: number }[]>().notNull().default(sql`'[]'::jsonb`),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().default(sql`now()`),
  undoneAt: timestamp('undone_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  hostHistoryIdx: index('idx_live_trade_completions_host_completed').on(table.hostUserId, table.completedAt),
}));

// ─── third_party_trade_drafts ────────────────────────────────────────────────
// In-progress third-party trade plan saved by a user from the Third-Party tab.
// Independent of trade_requests (no counterparty user) and live_trade_completions
// (no Redis session, not yet executed). The row IS the entire planning state —
// resume re-renders the editor exactly where the user left off.
//
// `their_offered` / `their_wanted` hold the partner's typed list lines so the
// editor can re-resolve against the live catalog on open (a re-seed between
// save and resume could shift variant IDs; codes + variant tokens are stable).
// `selection_*` hold the user's tick-state at save time as
// { stickerVariantId, quantity } rows; on resume the editor filters today's
// candidates by variant id and restores each row's quantity stepper.
// quantity null = "use the pool default" (the matcher-capped maximum).

export const thirdPartyTradeDrafts = pgTable('third_party_trade_drafts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  albumId: uuid('album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  partnerName: text('partner_name'),
  theirOffered: jsonb('their_offered').$type<{ albumCode: string; variantToken: string | null; quantity: number }[]>().notNull().default(sql`'[]'::jsonb`),
  theirWanted: jsonb('their_wanted').$type<{ albumCode: string; variantToken: string | null; quantity: number }[]>().notNull().default(sql`'[]'::jsonb`),
  selectionIReceive: jsonb('selection_i_receive').$type<{ stickerVariantId: string; quantity: number | null }[]>().notNull().default(sql`'[]'::jsonb`),
  selectionIGive: jsonb('selection_i_give').$type<{ stickerVariantId: string; quantity: number | null }[]>().notNull().default(sql`'[]'::jsonb`),
  iReceiveCashCents: integer('i_receive_cash_cents').notNull().default(0),
  iGiveCashCents: integer('i_give_cash_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userUpdatedIdx: index('idx_third_party_trade_drafts_user_updated').on(table.userId, table.updatedAt),
  cashNonNeg: check('third_party_trade_drafts_cash_nonneg', sql`${table.iReceiveCashCents} >= 0 AND ${table.iGiveCashCents} >= 0`),
}));

// ─── user_achievements ────────────────────────────────────────────────────────
// One row per (user, achievement_key) the moment a criterion is first met.
// Definitions live in code (packages/shared/src/constants/achievements.ts);
// the table only persists the unlocked_at timestamp so the profile can
// display badges chronologically. Re-evaluation is idempotent — repeated
// inserts are dropped by the primary key.

export const userAchievements = pgTable('user_achievements', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  achievementKey: text('achievement_key').notNull(),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.achievementKey] }),
  userIdx: index('idx_user_achievements_user_id').on(table.userId),
}));

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AlbumType = typeof albumTypes.$inferSelect;
export type NewAlbumType = typeof albumTypes.$inferInsert;
export type AlbumEdition = typeof albumEditions.$inferSelect;
export type NewAlbumEdition = typeof albumEditions.$inferInsert;
export type AlbumFormat = typeof albumFormats.$inferSelect;
export type NewAlbumFormat = typeof albumFormats.$inferInsert;
export type AlbumEditionFormat = typeof albumEditionFormats.$inferSelect;
export type NewAlbumEditionFormat = typeof albumEditionFormats.$inferInsert;
export type UserAlbum = typeof userAlbums.$inferSelect;
export type NewUserAlbum = typeof userAlbums.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type StickerAlbumPage = typeof stickerAlbumPages.$inferSelect;
export type TeamAlbumPage = typeof teamAlbumPages.$inferSelect;
export type Sticker = typeof stickers.$inferSelect;
export type StickerVariant = typeof stickerVariants.$inferSelect;
export type UserSticker = typeof userStickers.$inferSelect; // ownership via albumId
export type UserStickerFavourite = typeof userStickerFavourites.$inferSelect;
export type UserWantedVariant = typeof userWantedVariants.$inferSelect;
export type NewUserWantedVariant = typeof userWantedVariants.$inferInsert;
export type TradeRequest = typeof tradeRequests.$inferSelect;
export type TradeItem = typeof tradeItems.$inferSelect;
export type TradeMessage = typeof tradeMessages.$inferSelect;
export type ReportMessageRef = typeof reportMessageRefs.$inferSelect;
export type ReportAttachment = typeof reportAttachments.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type TradeInvite = typeof tradeInvites.$inferSelect;
export type NewTradeInvite = typeof tradeInvites.$inferInsert;
export type LiveTradeCompletion = typeof liveTradeCompletions.$inferSelect;
export type NewLiveTradeCompletion = typeof liveTradeCompletions.$inferInsert;
export type ThirdPartyTradeDraft = typeof thirdPartyTradeDrafts.$inferSelect;
export type NewThirdPartyTradeDraft = typeof thirdPartyTradeDrafts.$inferInsert;
