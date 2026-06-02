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

function check() {
  const src = loadSource();
  const { block } = findUnreleasedBlock(src);
  const n = countBullets(block);
  if (n === 0) {
    fail(`the 'Unreleased' entry in ${ENTRIES_REL} has no bullets. Add at least one before releasing — see CLAUDE.md § In-App Changelog.`);
  }
  console.log(`✓ Unreleased entry has ${n} bullet${n === 1 ? '' : 's'}`);
}

function todayUTC() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function rotate(version) {
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`'${version}' is not a valid release tag (expected 'vMAJOR.MINOR.PATCH[-prerelease]')`);
  }

  const src = loadSource();
  const { block, start, afterEnd } = findUnreleasedBlock(src);
  const n = countBullets(block);
  if (n === 0) {
    fail(`the 'Unreleased' entry in ${ENTRIES_REL} has no bullets. Add at least one before releasing — see CLAUDE.md § In-App Changelog.`);
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

const [, , subcommand, arg] = process.argv;
if (subcommand === 'check') {
  check();
} else if (subcommand === 'rotate') {
  if (!arg) fail('usage: rotate-changelog.mjs rotate <vX.Y.Z>');
  rotate(arg);
} else {
  fail('usage: rotate-changelog.mjs <check | rotate vX.Y.Z>');
}
