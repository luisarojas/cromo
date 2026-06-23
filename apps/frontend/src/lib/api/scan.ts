import { retryFetch, toQueryString, BASE_URL } from '../apiClient';
import type { ScanListResult } from './types';

/** Extract album codes from one or more images of a written/printed list. */
export async function scanList(
  files: File[],
  opts?: { albumTypeKey?: string; token?: string },
): Promise<ScanListResult> {
  const form = new FormData();
  for (const f of files) form.append('images', f, f.name);
  const qs = toQueryString({ albumTypeKey: opts?.albumTypeKey });
  // apiFetch always sets Content-Type: application/json on bodies, which
  // breaks multipart uploads. Use retryFetch directly so the browser can set
  // the multipart boundary itself.
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/list${qs}`, {
    method: 'POST',
    headers: opts?.token ? { Authorization: `Bearer ${opts.token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ScanListResult>;
}

export interface ScanResult {
  stickerNumber: number | null;
  albumCode: string | null;
  playerName: string | null;
  teamFifaCode: string | null;
  variantToken: string | null;
  stickerType: string | null;
  confidence: number;
  reasoning: string;
}

export interface BatchScanEntry {
  index: number;
  results?: ScanResult[];
  error?: string;
}

export async function scanIdentify(file: File, token: string, albumTypeKey?: string): Promise<ScanResult[]> {
  const form = new FormData();
  form.append('file', file);
  const qs = albumTypeKey ? `?albumTypeKey=${encodeURIComponent(albumTypeKey)}` : '';
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/identify${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ScanResult[]>;
}

export async function scanBatchStream(
  files: File[],
  token: string,
  onEvent: (entry: BatchScanEntry) => Promise<void> | void,
  albumTypeKey?: string,
): Promise<void> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const qs = albumTypeKey ? `?albumTypeKey=${encodeURIComponent(albumTypeKey)}` : '';
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/batch${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (!res.body) throw new Error('No response body from batch scan');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          pendingEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && pendingEvent === 'result') {
          try {
            const entry = JSON.parse(line.slice(6)) as BatchScanEntry;
            await onEvent(entry);
          } catch { /* ignore malformed event */ }
          pendingEvent = '';
        } else if (line === '') {
          pendingEvent = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
