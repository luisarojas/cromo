// Tiny localStorage-backed pointer to the most recently used scan target,
// so the dashboard can offer a one-tap "continue scanning" entry. The user
// flow this enables: user scans into "Mexico International", closes the tab,
// comes back later — dashboard shows "Resume scanning Mexico International"
// pre-pointing at the same album instead of forcing them through the picker.

const KEY = 'cromo:lastScan';
const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000; // a week — long enough to span a typical pack-opening session.

export interface LastScan {
  albumId: string;
  albumLabel: string;
  at: number;
}

export function rememberLastScan(albumId: string, albumLabel: string): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: LastScan = { albumId, albumLabel, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota/privacy mode — silently ignore.
  }
}

export function readLastScan(): LastScan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastScan;
    if (!parsed.albumId || !parsed.at) return null;
    if (Date.now() - parsed.at > FRESH_FOR_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastScan(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ── Activity streak ────────────────────────────────────────────────────────
// A list of YYYY-MM-DD strings recording every day the user opened a Scanner.
// We compute streak as "consecutive days ending today or yesterday" because
// streaks that broke yesterday still count — the user can keep them alive by
// scanning today. Cap retention at 60 days to avoid unbounded localStorage growth.

const STREAK_KEY = 'cromo:scanDays';
const STREAK_MAX_DAYS = 60;

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function readDays(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function recordScanDay(): void {
  if (typeof window === 'undefined') return;
  try {
    const today = todayISO();
    const days = readDays();
    if (days[days.length - 1] === today) return;
    days.push(today);
    const trimmed = days.slice(-STREAK_MAX_DAYS);
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function readStreak(): { current: number; lastDay: string | null } {
  const days = readDays();
  if (days.length === 0) return { current: 0, lastDay: null };
  // Walk backward counting consecutive days. The reference point is today —
  // if the user last scanned today, today counts; if yesterday, the streak is
  // still alive but doesn't grow until they scan again today.
  const oneDayMs = 86_400_000;
  const todayMs = new Date(todayISO()).getTime();
  let count = 0;
  let cursorMs = todayMs;
  // Latest day must be either today or yesterday for the streak to be live.
  const lastMs = new Date(days[days.length - 1]!).getTime();
  if (todayMs - lastMs > oneDayMs) return { current: 0, lastDay: days[days.length - 1] ?? null };
  // Walk the recorded days in reverse, decrementing the cursor day-by-day.
  for (let i = days.length - 1; i >= 0; i--) {
    const dayMs = new Date(days[i]!).getTime();
    if (dayMs === cursorMs) {
      count++;
      cursorMs -= oneDayMs;
    } else if (dayMs < cursorMs) {
      break;
    }
  }
  return { current: count, lastDay: days[days.length - 1] ?? null };
}
