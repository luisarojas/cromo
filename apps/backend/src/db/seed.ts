import { Pool } from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two locations because the SQL files live at the repo root for the bash
// wrapper (scripts/seed-database.sh + remote-recreate-db.sh + the dev S3
// bootstrap) but the production image is self-contained — Dockerfile.cloud
// copies scripts/seeds → dist/db/seeds so this runner has a copy alongside
// the compiled JS. Whichever path exists wins.
const SEEDS_FOLDER = [
  path.resolve(__dirname, 'seeds'),
  path.resolve(__dirname, '../../../../scripts/seeds'),
].find(existsSync);

// Explicit order, not directory sort: 07/09 (test fixtures) must run AFTER
// every catalog seed because they reference stickers/variants/teams the
// catalog seeds populate. Alphabetical sort would slot 07 between 06 and 08
// and fail on FK lookups for CC/Extra rows.
const CATALOG_SEEDS = [
  '00_album_catalog.sql',
  '01_teams.sql',
  '02_intro_stickers.sql',
  '03_team_stickers.sql',
  '05_variants.sql',
  '06_feature_flags.sql',
  '08_coca_cola_stickers.sql',
  '10_extra_stickers.sql',
  '13_team_album_pages.sql',
  '14_sticker_album_pages.sql',
];

const TEST_FIXTURE_SEEDS = [
  '07_test_users.sql',
  '09_trust_safety.sql',
];

export async function runCatalogSeed(pool: Pool): Promise<void> {
  if (!SEEDS_FOLDER) {
    console.warn('[seed] No seeds folder found; skipping catalog seed.');
    return;
  }

  const files = [
    ...CATALOG_SEEDS,
    ...(env.NODE_ENV === 'production' ? [] : TEST_FIXTURE_SEEDS),
  ];

  console.log(`[seed] Applying ${files.length} seed file(s) from ${SEEDS_FOLDER}`);
  for (const file of files) {
    const full = path.join(SEEDS_FOLDER, file);
    const sql = readFileSync(full, 'utf8');
    await pool.query(sql);
    console.log(`[seed]   ✓ ${file}`);
  }
  console.log('[seed] Catalog seeds applied.');
}
