// One-time generator: builds apps/backend/src/wc2026/player-clubs.data.ts — a
// static map of (normalized player name) → current club, sourced from ESPN.
//
// Why ESPN (not Wikidata): the previous Wikidata generator disambiguated
// same-named footballers by citizenship and that failed badly — e.g. France's
// Lucas Hernández resolved to a Brazilian namesake at Atlético Mineiro, and
// stale Wikidata rows put N'Golo Kanté at Fenerbahçe. ESPN's per-nation roster
// IS the actual WC squad, so every athlete is unambiguously the right person,
// and each carries a `defaultTeam` ref to their CURRENT club in a maintained
// sports database. No name matching, no citizenship guessing.
//
// Why static: club affiliations don't change during the ~5-week tournament
// (transfer windows are closed), so we snapshot them once. The live football-data
// squad feed has no club field; we attach this snapshot by normalized name.
//
// One gotcha: when ESPN has no club for a player, `defaultTeam` points at the
// NATIONAL team instead. We detect that (the id is one of the 48 WC nations) and
// omit the club — an honest blank beats a wrong guess, which is the whole reason
// we moved off Wikidata.
//
// Run from the repo root (no API key needed — ESPN's endpoints are public):
//   node scripts/wc2026-build-player-clubs.mjs

import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (CromoWC2026; player-club enrichment)';
const OUT = 'apps/backend/src/wc2026/player-clubs.data.ts';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/teams';
const CORE_ATH = 'https://sports.core.api.espn.com/v2/sports/soccer/athletes';

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status >= 500) throw new Error(`espn ${r.status}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (attempt < 3) {
      await sleep(1500 * (attempt + 1));
      return getJson(url, attempt + 1);
    }
    throw e;
  }
}

// "…/teams/362?lang=en" → "362"
const teamIdFromRef = (ref) => (ref ? (ref.match(/\/teams\/(\d+)/)?.[1] ?? null) : null);

async function main() {
  console.log('Fetching the 48 WC nations from ESPN…');
  const teamsDoc = await getJson(`${SITE}/teams`);
  const nations = (teamsDoc?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team ?? t);
  if (nations.length === 0) throw new Error('no nations from ESPN');
  const nationalIds = new Set(nations.map((n) => String(n.id)));
  console.log(`  ${nations.length} nations`);

  const playerClub = {}; // normalized name → club id
  const clubIds = new Set();
  let total = 0;

  for (const nation of nations) {
    const roster = await getJson(`${SITE}/teams/${nation.id}/roster`);
    const athletes = roster?.athletes ?? [];
    let resolved = 0;
    for (const a of athletes) {
      total += 1;
      let clubId = teamIdFromRef(a.defaultTeam?.$ref);
      // The roster's defaultTeam falls back to the NATIONAL team when ESPN has
      // no club inline. The per-athlete core record still carries the real club,
      // so fetch it for the fallback cases (Théo Hernández → Al Hilal, etc.).
      if ((!clubId || nationalIds.has(clubId)) && a.id) {
        const core = await getJson(`${CORE_ATH}/${a.id}?lang=en`);
        const coreId = teamIdFromRef(core?.defaultTeam?.$ref);
        if (coreId && !nationalIds.has(coreId)) clubId = coreId;
        await sleep(60);
      }
      // Still no real club → leave blank (honest, never a guess).
      if (!clubId || nationalIds.has(clubId)) continue;
      clubIds.add(clubId);
      // Key by nation code + name. Keying by name alone collides across squads
      // (two "Emiliano Martínez" — Argentina/Aston Villa vs another/Palmeiras —
      // last-write-wins corrupts one). ESPN abbreviations equal the FIFA codes
      // the live provider passes, so `${code}|${name}` is unambiguous. Store
      // under both display and full name to match football-data's romanization.
      for (const n of [a.displayName, a.fullName].filter(Boolean)) {
        playerClub[`${nation.abbreviation}|${norm(n)}`] = clubId;
      }
      resolved += 1;
    }
    console.log(`  ${nation.displayName ?? nation.abbreviation}: ${resolved}/${athletes.length} with a club`);
    await sleep(120);
  }

  console.log(`\nResolving ${clubIds.size} distinct club names…`);
  const clubName = new Map();
  for (const id of clubIds) {
    const doc = await getJson(`${CORE}/${id}?lang=en`);
    const name = doc?.displayName ?? doc?.name ?? doc?.nickname;
    if (name) clubName.set(id, name);
    await sleep(80);
  }

  const out = {};
  for (const [name, id] of Object.entries(playerClub)) {
    const club = clubName.get(id);
    if (club) out[name] = club;
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  const header =
    '// GENERATED by scripts/wc2026-build-player-clubs.mjs — do not edit by hand.\n' +
    '// Maps a normalized player name → current club, snapshotted from ESPN\n' +
    "// (each nation's roster, the player's defaultTeam → club). Clubs don't change\n" +
    '// mid-tournament; regenerate when squads finalize.\n';
  writeFileSync(
    OUT,
    header + 'export const PLAYER_CLUBS: Record<string, string> = ' + JSON.stringify(sorted, null, 0) + ';\n',
  );
  console.log(`\nDone. Resolved clubs for ${Object.keys(sorted).length} name-keys across ${total} players → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
