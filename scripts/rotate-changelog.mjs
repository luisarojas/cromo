#!/usr/bin/env node
// scripts/rotate-changelog.mjs
//
// Validate or rotate the in-app changelog data file at
// apps/frontend/src/app/changelog/entries.ts. Invoked from scripts/release.sh
// — see CLAUDE.md § In-App Changelog for the full convention.
//
// Subcommands:
//   check                 Fail if the first entry isn't 'Unreleased' or has
//                         no bullets. No mutations.
//   rotate <vX.Y.Z>       Rename the 'Unreleased' entry to <vX.Y.Z>, stamp
//                         today's UTC date, and prepend a fresh empty
//                         'Unreleased' block. Implies a check first.
//   notes <vX.Y.Z>        Print the entry's bullets as GitHub-flavored
//                         markdown on stdout (### category headings +
//                         '- ' bullets). Used by release.sh to feed the
//                         body of `gh release create`. Emits nothing
//                         (exit 0) when the entry has no bullets, so the
//                         caller can ship an empty GitHub release body.
//
// Flags (apply to check and rotate):
//   --allow-empty         Permit an empty 'Unreleased' block. Default is
//                         to fail, since shipping a release with no notes
//                         is almost always a mistake.
//
// Why a regex-based mutator instead of a TS parser: entries.ts has a tight,
// project-controlled shape and is only ever edited by humans following the
// convention. If someone reformats it in a way that breaks these matchers,
// the script fails loudly and the shape gets restored — which is the right
// failure mode (the file IS the convention).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRIES_PATH = path.join(REPO_ROOT, 'apps/frontend/src/app/changelog/entries.ts');
const ENTRIES_REL = path.relative(REPO_ROOT, ENTRIES_PATH);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function loadSource() {
  if (!fs.existsSync(ENTRIES_PATH)) {
    fail(`expected ${ENTRIES_REL} to exist`);
  }
  return fs.readFileSync(ENTRIES_PATH, 'utf8');
}

// Bracket-count from `start` (which must point at an open brace) to its
// matching close, respecting single/double/backtick string literals and
// backslash escapes. Returns the index of the close brace, or -1 if
// unterminated.
function findMatchingBrace(src, start) {
  let depth = 0;
  let inString = false;
  let stringDelim = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringDelim) inString = false;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inString = true;
      stringDelim = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findUnreleasedBlock(src) {
  const arrayMarker = 'CHANGELOG: ChangelogEntry[] = [';
  const arrayStart = src.indexOf(arrayMarker);
  if (arrayStart === -1) {
    fail(`couldn't find '${arrayMarker}' in ${ENTRIES_REL} — has the shape changed?`);
  }

  const firstBrace = src.indexOf('{', arrayStart + arrayMarker.length);
  if (firstBrace === -1) {
    fail(`CHANGELOG array in ${ENTRIES_REL} is empty — expected an 'Unreleased' entry at index 0`);
  }

  const closeBrace = findMatchingBrace(src, firstBrace);
  if (closeBrace === -1) {
    fail(`unterminated first entry block in ${ENTRIES_REL}`);
  }

  const block = src.slice(firstBrace, closeBrace + 1);
  if (!/version:\s*'Unreleased'/.test(block)) {
    fail(`first entry in ${ENTRIES_REL} is not 'Unreleased'. Move the Unreleased block to index 0 before releasing.`);
  }
  if (!/date:\s*null/.test(block)) {
    fail(`the 'Unreleased' entry in ${ENTRIES_REL} must have date: null`);
  }

  return { block, start: firstBrace, afterEnd: closeBrace + 1 };
}

function countBullets(block) {
  const changesIdx = block.indexOf('changes:');
  if (changesIdx === -1) fail(`missing 'changes:' in the Unreleased entry`);
  const openBrace = block.indexOf('{', changesIdx);
  if (openBrace === -1) fail(`missing '{' after 'changes:' in the Unreleased entry`);
  const closeBrace = findMatchingBrace(block, openBrace);
  if (closeBrace === -1) fail(`unterminated 'changes' object in the Unreleased entry`);

  const body = block.slice(openBrace + 1, closeBrace);
  // Count quoted string literals — each bullet is one. Object keys
  // (Added/Changed/…) are bare identifiers in our convention, so they
  // don't get counted.
  const strings = body.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) ?? [];
  return strings.length;
}

function check(allowEmpty) {
  const src = loadSource();
  const { block } = findUnreleasedBlock(src);
  const n = countBullets(block);
  if (n === 0 && !allowEmpty) {
    fail(`the 'Unreleased' entry in ${ENTRIES_REL} has no bullets. Add at least one before releasing — see CLAUDE.md § In-App Changelog. Pass --allow-empty to release without notes.`);
  }
  console.log(`✓ Unreleased entry has ${n} bullet${n === 1 ? '' : 's'}${n === 0 ? ' (empty release, allowed)' : ''}`);
}

function todayUTC() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function rotate(version, allowEmpty) {
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`'${version}' is not a valid release tag (expected 'vMAJOR.MINOR.PATCH[-prerelease]')`);
  }

  const src = loadSource();
  const { block, start, afterEnd } = findUnreleasedBlock(src);
  const n = countBullets(block);
  if (n === 0 && !allowEmpty) {
    fail(`the 'Unreleased' entry in ${ENTRIES_REL} has no bullets. Add at least one before releasing — see CLAUDE.md § In-App Changelog. Pass --allow-empty to release without notes.`);
  }

  const today = todayUTC();
  const renamed = block
    .replace(/version:\s*'Unreleased'/, `version: '${version}'`)
    .replace(/date:\s*null/, `date: '${today}'`);

  // Indentation matches existing entries (2 spaces inside the array).
  const freshUnreleased =
    `{\n` +
    `    version: 'Unreleased',\n` +
    `    date: null,\n` +
    `    changes: {},\n` +
    `  }`;

  const before = src.slice(0, start);
  const after = src.slice(afterEnd);
  const next = `${before}${freshUnreleased},\n  ${renamed}${after}`;

  fs.writeFileSync(ENTRIES_PATH, next);
  console.log(`✓ Rotated changelog: ${version} (${today}); fresh Unreleased prepended.`);
}

// Mirror of findMatchingBrace but for any bracket pair. Used to locate the
// end of a `[ ... ]` array literal inside a `changes:` body without tripping
// over '[' / ']' that appear inside string bullets.
function findMatchingBracket(src, start, open, close) {
  let depth = 0;
  let inString = false;
  let stringDelim = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringDelim) inString = false;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inString = true;
      stringDelim = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Find the entry block whose `version:` field equals `version`. Returns the
// matched block plus its slice offsets, like findUnreleasedBlock.
function findEntryByVersion(src, version) {
  const arrayMarker = 'CHANGELOG: ChangelogEntry[] = [';
  const arrayStart = src.indexOf(arrayMarker);
  if (arrayStart === -1) {
    fail(`couldn't find '${arrayMarker}' in ${ENTRIES_REL} — has the shape changed?`);
  }
  const arrayOpen = arrayStart + arrayMarker.length - 1; // position of '['
  const arrayClose = findMatchingBracket(src, arrayOpen, '[', ']');
  if (arrayClose === -1) fail(`unterminated CHANGELOG array in ${ENTRIES_REL}`);

  let cursor = arrayOpen + 1;
  while (cursor < arrayClose) {
    const openBrace = src.indexOf('{', cursor);
    if (openBrace === -1 || openBrace > arrayClose) break;
    const closeBrace = findMatchingBrace(src, openBrace);
    if (closeBrace === -1) fail(`unterminated entry block in ${ENTRIES_REL}`);
    const block = src.slice(openBrace, closeBrace + 1);
    const m = /version:\s*'([^']+)'/.exec(block);
    if (m && m[1] === version) {
      return { block, start: openBrace, afterEnd: closeBrace + 1 };
    }
    cursor = closeBrace + 1;
  }
  fail(`no entry with version '${version}' in ${ENTRIES_REL}`);
}

// Extract bullets per category from an entry block's `changes: { ... }`
// object. Returns { Added: [...], Changed: [...], ... } with only the
// categories that actually have bullets.
function parseChanges(block) {
  const changesIdx = block.indexOf('changes:');
  if (changesIdx === -1) fail(`missing 'changes:' in entry block`);
  const openBrace = block.indexOf('{', changesIdx);
  if (openBrace === -1) fail(`missing '{' after 'changes:'`);
  const closeBrace = findMatchingBrace(block, openBrace);
  if (closeBrace === -1) fail(`unterminated 'changes' object`);
  const body = block.slice(openBrace + 1, closeBrace);

  const out = {};
  for (const cat of ['Added', 'Changed', 'Fixed', 'Removed', 'Security']) {
    const re = new RegExp(`\\b${cat}\\s*:\\s*\\[`);
    const m = re.exec(body);
    if (!m) continue;
    const arrayOpen = m.index + m[0].length - 1; // position of '['
    const arrayClose = findMatchingBracket(body, arrayOpen, '[', ']');
    if (arrayClose === -1) fail(`unterminated array for '${cat}'`);
    const arrBody = body.slice(arrayOpen + 1, arrayClose);
    const strRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
    const bullets = [];
    let sm;
    while ((sm = strRe.exec(arrBody)) !== null) {
      const raw = sm[1] !== undefined ? sm[1] : sm[2];
      // Unescape backslash-escapes (\' \" \\ \n etc.) into their literal
      // characters so the markdown output reads naturally.
      bullets.push(raw.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c)));
    }
    if (bullets.length > 0) out[cat] = bullets;
  }
  return out;
}

function notes(version) {
  const src = loadSource();
  const { block } = findEntryByVersion(src, version);
  const changes = parseChanges(block);
  const parts = [];
  for (const cat of ['Added', 'Changed', 'Fixed', 'Removed', 'Security']) {
    const bullets = changes[cat];
    if (!bullets) continue;
    parts.push(`### ${cat}`);
    for (const b of bullets) parts.push(`- ${b}`);
    parts.push('');
  }
  // Empty notes are allowed (release.sh's --allow-empty path). The caller
  // can branch on stdout being empty and skip --notes when invoking gh.
  if (parts.length === 0) return;
  process.stdout.write(parts.join('\n').replace(/\n+$/, '\n'));
}

const argv = process.argv.slice(2);
const allowEmpty = argv.includes('--allow-empty');
const positional = argv.filter(a => !a.startsWith('--'));
const [subcommand, arg] = positional;

if (subcommand === 'check') {
  check(allowEmpty);
} else if (subcommand === 'rotate') {
  if (!arg) fail('usage: rotate-changelog.mjs rotate <vX.Y.Z> [--allow-empty]');
  rotate(arg, allowEmpty);
} else if (subcommand === 'notes') {
  if (!arg) fail('usage: rotate-changelog.mjs notes <vX.Y.Z>');
  notes(arg);
} else {
  fail('usage: rotate-changelog.mjs <check | rotate vX.Y.Z | notes vX.Y.Z> [--allow-empty]');
}
