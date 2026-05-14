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

// ─── user_albums ──────────────────────────────────────────────────────────────

export interface AlbumSettings {
  include_all_stickers: boolean;
  include_coca_cola: boolean;
  include_non_album_museum: boolean;
}

const DEFAULT_ALBUM_SETTINGS: AlbumSettings = {
  include_all_stickers: true,
  include_coca_cola: true,
  include_non_album_museum: true,
};

export const userAlbums = pgTable('user_albums', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  albumTypeId: uuid('album_type_id').notNull().references(() => albumTypes.id),
  albumEditionId: uuid('album_edition_id').notNull(),
  alias: text('alias'),
  isDefault: boolean('is_default').notNull().default(false),
  settings: jsonb('settings').$type<AlbumSettings>().notNull().default(DEFAULT_ALBUM_SETTINGS),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index('idx_user_albums_user_id').on(table.userId),
  albumTypeIdx: index('idx_user_albums_album_type_id').on(table.albumTypeId),
  albumEditionIdx: index('idx_user_albums_album_edition_id').on(table.albumEditionId),
  aliasLengthCheck: check('user_albums_alias_length', sql`${table.alias} IS NULL OR (char_length(${table.alias}) BETWEEN 1 AND 100)`),
  // Composite FK ensures the chosen edition belongs to the chosen album type.
  editionMatchesType: foreignKey({
    name: 'user_albums_edition_matches_type',
    columns: [table.albumEditionId, table.albumTypeId],
    foreignColumns: [albumEditions.id, albumEditions.albumTypeId],
  }),
}));

// ─── user_settings ────────────────────────────────────────────────────────────

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  collectionVisibility: text('collection_visibility').default('private'),
  profileVisibility: text('profile_visibility').default('public'),
  tradeMatchingEnabled: boolean('trade_matching_enabled').default(true),
  emailTradeRequests: boolean('email_trade_requests').default(true),
  emailTradeMessages: boolean('email_trade_messages').default(true),
  emailMarketing: boolean('email_marketing').default(false),
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
  marketingConsentVersion: text('marketing_consent_version'),
  showTrustScorePublic: boolean('show_trust_score_public').default(true),
  duplicatesCountAllVariants: boolean('duplicates_count_all_variants').notNull().default(false),
}, (table) => ({
  collectionVisibilityCheck: check('user_settings_collection_visibility_check', sql`${table.collectionVisibility} IN ('private', 'friends', 'public')`),
  profileVisibilityCheck: check('user_settings_profile_visibility_check', sql`${table.profileVisibility} IN ('private', 'public')`),
}));

// ─── consent_records ──────────────────────────────────────────────────────────

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  consentType: text('consent_type').notNull(),
  granted: boolean('granted').notNull(),
  policyVersion: text('policy_version').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── email_verification_tokens ────────────────────────────────────────────────

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  token: text('token').primaryKey().$defaultFn(() => crypto.randomBytes(32).toString('hex')),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  albumTypeCodeUnique: unique('stickers_album_type_id_album_code_unique').on(table.albumTypeId, table.albumCode),
  albumTypeIdx: index('idx_stickers_album_type_id').on(table.albumTypeId),
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
}));

// ─── user_stickers ────────────────────────────────────────────────────────────

export const userStickers = pgTable('user_stickers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  albumId: uuid('album_id').notNull().references(() => userAlbums.id, { onDelete: 'cascade' }),
  stickerVariantId: uuid('sticker_variant_id').notNull().references(() => stickerVariants.id),
  quantity: integer('quantity').notNull().default(1),
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

// ─── trade_requests ───────────────────────────────────────────────────────────

export const tradeRequests = pgTable('trade_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  recipientId: uuid('recipient_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  counterCount: integer('counter_count').notNull().default(0),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
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
}));

// ─── trade_items ──────────────────────────────────────────────────────────────

export const tradeItems = pgTable('trade_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id),
  stickerVariantId: uuid('sticker_variant_id').notNull().references(() => stickerVariants.id),
  direction: text('direction').notNull(),
  quantity: integer('quantity').notNull().default(1),
}, (table) => ({
  quantityCheck: check('trade_items_quantity_check', sql`${table.quantity} > 0`),
}));

// ─── trade_messages ───────────────────────────────────────────────────────────

export const tradeMessages = pgTable('trade_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  tradeIdIdx: index('idx_trade_messages_trade_id').on(table.tradeId, table.sentAt),
  bodyCheck: check('trade_messages_body_check', sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
}));

// ─── public_lists ─────────────────────────────────────────────────────────────

export const publicLists = pgTable('public_lists', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  listType: text('list_type').notNull(),
  shareToken: text('share_token').unique().notNull().$defaultFn(
    () => crypto.randomBytes(16).toString('hex')
  ),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── password_reset_tokens ────────────────────────────────────────────────────

export const passwordResetTokens = pgTable('password_reset_tokens', {
  token: text('token').primaryKey().$defaultFn(() => crypto.randomBytes(32).toString('hex')),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ─── trade_ratings ────────────────────────────────────────────────────────────

export const tradeRatings = pgTable('trade_ratings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tradeId: uuid('trade_id').notNull().references(() => tradeRequests.id),
  raterId: uuid('rater_id').notNull().references(() => users.id),
  ratedUserId: uuid('rated_user_id').notNull().references(() => users.id),
  isPositive: boolean('is_positive').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  tradeRaterUnique: uniqueIndex('trade_ratings_trade_id_rater_id_unique').on(
    table.tradeId,
    table.raterId
  ),
  commentCheck: check('trade_ratings_comment_check', sql`char_length(${table.comment}) <= 500`),
  raterCheck: check('trade_ratings_rater_check', sql`${table.raterId} <> ${table.ratedUserId}`),
}));

// ─── user_reports ─────────────────────────────────────────────────────────────

export const userReports = pgTable('user_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reporterId: uuid('reporter_id').notNull().references(() => users.id),
  reportedUserId: uuid('reported_user_id').notNull().references(() => users.id),
  tradeId: uuid('trade_id').references(() => tradeRequests.id),
  category: text('category').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('open'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
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
}));

// ─── user_bans ────────────────────────────────────────────────────────────────

export const userBans = pgTable('user_bans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  banType: text('ban_type').notNull(),
  reason: text('reason').notNull(),
  reportId: uuid('report_id').references(() => userReports.id),
  bannedBy: uuid('banned_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: uuid('lifted_by').references(() => users.id),
  liftReason: text('lift_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  banTypeCheck: check('user_bans_ban_type_check', sql`${table.banType} IN ('soft','hard')`),
  reasonCheck: check('user_bans_reason_check', sql`char_length(${table.reason}) BETWEEN 5 AND 1000`),
  liftReasonCheck: check('user_bans_lift_reason_check', sql`char_length(${table.liftReason}) <= 500`),
}));

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AlbumType = typeof albumTypes.$inferSelect;
export type NewAlbumType = typeof albumTypes.$inferInsert;
export type AlbumEdition = typeof albumEditions.$inferSelect;
export type NewAlbumEdition = typeof albumEditions.$inferInsert;
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
export type TradeRequest = typeof tradeRequests.$inferSelect;
export type TradeItem = typeof tradeItems.$inferSelect;
export type TradeMessage = typeof tradeMessages.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
