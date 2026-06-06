'use client';

import { useEffect } from 'react';

// Lightweight global hotkey registration. We intentionally avoid a third-party
// library: most of those buy bindings for chords / sequences we don't need.
// The contract: hand us a string spec like 'g d', '?', 'mod+k', '/' and we
// match against keydown. The hook short-circuits when typing inside an
// editable element so / inside a search input still inserts a slash.
//
// Spec grammar:
//   'mod+k'        meta on macOS, ctrl elsewhere
//   'shift+/'      pinned modifier
//   'g d'          chord: g then d within 1.2s
//   '?'            shifted character; matched on event.key
//
// Multiple specs can be separated by ' | ': 'mod+k | ctrl+k'.

const CHORD_WINDOW_MS = 1200;

export interface HotkeyOptions {
  // When true, hotkey fires even if the user is typing in an editable element.
  // Defaults to false. Use sparingly (e.g. Escape in modals).
  allowInEditable?: boolean;
  // Disable without unmounting the consumer. Useful when a modal opens and
  // grid hotkeys should pause without changing the component tree.
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPad|iPhone|iPod/.test(navigator.platform);
}

// Normalise a keydown event into the same shape we parse from the spec, so the
// matcher is a simple string comparison.
//
// Subtleties this function handles so spec authors can stay terse:
//  - `e.key === ' '` is rewritten to 'space' so 'space' matches naturally.
//  - When the user types a *shifted symbol* (e.g. Shift+/ produces '?'),
//    the browser already encoded the shift state in the character. We drop
//    the shift modifier so the spec `'?'` matches without forcing authors to
//    write `'shift+?'`. We DO keep shift for letters (`Shift+a` produces
//    `'A'` whose lowercase is `'a'` — that's a real shift+letter combo).
//  - Modifier keys themselves (e.shiftKey alone, no other key) emit
//    'shift' as the key and would match nothing useful; we filter those.
function isShiftedSymbol(key: string): boolean {
  if (key.length !== 1) return false;
  // Alphanumeric: shift+letter is semantically meaningful.
  if (/[a-z0-9]/i.test(key)) return false;
  // Everything else (single-char symbols like ?, +, !) absorbs the shift.
  return true;
}

function eventToToken(e: KeyboardEvent): string {
  // Pure modifier keypress — no useful token to match.
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return '';

  let key = e.key;
  if (key === ' ') key = 'space';
  key = key.toLowerCase();

  const parts: string[] = [];
  if (e.metaKey && isMac()) parts.push('mod');
  if (e.ctrlKey && !isMac()) parts.push('mod');
  if (e.ctrlKey && isMac()) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && !isShiftedSymbol(e.key)) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

// Convert one spec ('mod+k', 'g d', '?') to a list of token sequences.
// For chords ('g d'), we return ['g', 'd']. For single keys, ['mod+k'].
function parseSpec(spec: string): string[] {
  const trimmed = spec.trim().toLowerCase();
  if (trimmed.includes(' ')) {
    return trimmed.split(/\s+/);
  }
  return [trimmed];
}

interface PendingChord {
  remaining: string[][];   // active sequences still alive
  matchedSoFar: number;    // how many tokens of each have matched
  timeout: ReturnType<typeof setTimeout>;
}

let activeChord: PendingChord | null = null;

function clearChord() {
  if (activeChord) {
    clearTimeout(activeChord.timeout);
    activeChord = null;
  }
}

export function useHotkeys(
  specs: string | string[],
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { allowInEditable = false, enabled = true } = options;
  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(specs) ? specs : [specs];
    // Flatten 'mod+k | ctrl+k' into multiple specs.
    const expanded: string[] = [];
    for (const raw of list) {
      for (const piece of raw.split('|')) expanded.push(piece.trim());
    }
    const sequences = expanded.map(parseSpec);
    // Bucket by length so single-key vs chord handling is straightforward.
    const singles = sequences.filter((s) => s.length === 1).map((s) => s[0]!);
    const chords = sequences.filter((s) => s.length > 1);

    function onKey(e: KeyboardEvent) {
      if (!allowInEditable && isEditableTarget(e.target)) return;
      const token = eventToToken(e);
      if (!token) return;
      // Single-key match.
      if (singles.includes(token)) {
        e.preventDefault();
        clearChord();
        handler(e);
        return;
      }
      // Chord progression.
      if (activeChord) {
        const advanced = activeChord.remaining
          .filter((seq) => seq[activeChord!.matchedSoFar] === token);
        if (advanced.length === 0) {
          clearChord();
          return;
        }
        const matchedIdx = activeChord.matchedSoFar + 1;
        const completed = advanced.find((seq) => seq.length === matchedIdx);
        if (completed) {
          e.preventDefault();
          clearChord();
          handler(e);
          return;
        }
        activeChord = {
          remaining: advanced,
          matchedSoFar: matchedIdx,
          timeout: setTimeout(clearChord, CHORD_WINDOW_MS),
        };
        return;
      }
      // New chord start.
      const starting = chords.filter((seq) => seq[0] === token);
      if (starting.length > 0) {
        e.preventDefault();
        activeChord = {
          remaining: starting,
          matchedSoFar: 1,
          timeout: setTimeout(clearChord, CHORD_WINDOW_MS),
        };
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [specs, handler, allowInEditable, enabled]);
}

// Pretty-print a hotkey spec for the cheatsheet. Replaces 'mod' with the
// platform-appropriate symbol and capitalises single chars.
export function formatHotkey(spec: string): string {
  const mod = isMac() ? '⌘' : 'Ctrl';
  return spec
    .replace(/\bmod\b/gi, mod)
    .replace(/\bctrl\b/gi, 'Ctrl')
    .replace(/\balt\b/gi, isMac() ? '⌥' : 'Alt')
    .replace(/\bshift\b/gi, isMac() ? '⇧' : 'Shift')
    .replace(/\benter\b/gi, '↵')
    .replace(/\bescape\b/gi, 'Esc')
    .replace(/\barrowup\b/gi, '↑')
    .replace(/\barrowdown\b/gi, '↓')
    .replace(/\barrowleft\b/gi, '←')
    .replace(/\barrowright\b/gi, '→')
    .split(' ')
    .map((chord) =>
      chord.split('+').map((p) => (p.length === 1 ? p.toUpperCase() : p)).join('+'),
    )
    .join(' then ');
}
