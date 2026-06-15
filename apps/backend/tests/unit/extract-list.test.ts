import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/env.js', () => ({
  env: {
    SCAN_PROVIDER: 'groq',
    SCAN_MODEL: undefined,
    GROQ_API_KEY: 'fake',
    GEMINI_API_KEY: 'fake',
  },
}));

vi.mock('sharp', () => {
  const stub = Object.assign(
    (buf: Buffer) => ({ rotate: () => ({ toBuffer: async () => buf }) }),
    { concurrency: vi.fn() },
  );
  return { default: stub };
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

import { extractListFromImage } from '../../src/services/scan.service.js';

function groqResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('extractListFromImage', () => {
  it('parses { offered, wanted } and normalises each code', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({
      offered: ['bra 5', 'ARG-7', 'FWC.2'],
      wanted: ['ex12', 'CC4'],
    })));
    const out = await extractListFromImage(Buffer.from('img'), 'image/jpeg');
    expect(out.offered).toEqual(['BRA5', 'ARG7', 'FWC2']);
    expect(out.wanted).toEqual(['EX12', 'CC4']);
  });

  it('drops malformed codes that fail normalizeAlbumCode (returns empty string)', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({
      offered: ['BRA5', '12345', 'B', 'BRA12'],
      wanted: [],
    })));
    const out = await extractListFromImage(Buffer.from('img'), 'image/jpeg');
    // '12345' (no letters) and 'B' (only one letter, no digits) get filtered.
    expect(out.offered).toEqual(['BRA5', 'BRA12']);
  });

  it('coerces missing offered/wanted keys to empty arrays', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({})));
    const out = await extractListFromImage(Buffer.from('img'), 'image/jpeg');
    expect(out).toEqual({ offered: [], wanted: [] });
  });

  it('filters non-string entries inside the arrays', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({
      offered: ['BRA5', 42, null, { code: 'ARG7' }, 'MEX18'],
      wanted: [],
    })));
    const out = await extractListFromImage(Buffer.from('img'), 'image/jpeg');
    expect(out.offered).toEqual(['BRA5', 'MEX18']);
  });

  it('strips a leading ```json code fence', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse('```json\n{"offered":["BRA5"],"wanted":[]}\n```'));
    const out = await extractListFromImage(Buffer.from('img'), 'image/jpeg');
    expect(out.offered).toEqual(['BRA5']);
  });

  it('throws when the model returns unparseable JSON', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse('definitely not json'));
    await expect(extractListFromImage(Buffer.from('img'), 'image/jpeg')).rejects.toThrow(/invalid JSON/);
  });

  it('short-circuits to MOCK_LIST_BUCKETS when the key is "mock"', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: {
        SCAN_PROVIDER: 'groq', SCAN_MODEL: undefined,
        GROQ_API_KEY: 'mock', GEMINI_API_KEY: 'fake',
      },
    }));
    vi.resetModules();
    const { extractListFromImage: mockExtract } = await import('../../src/services/scan.service.js');
    const out = await mockExtract(Buffer.from('img'), 'image/jpeg');
    expect(out.offered.length).toBeGreaterThan(0);
    expect(out.wanted.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
