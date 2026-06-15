import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub env so identifySticker doesn't short-circuit to MOCK_RESULTS and we
// actually exercise the provider branches.
vi.mock('../../src/env.js', () => ({
  env: {
    SCAN_PROVIDER: 'groq',
    SCAN_MODEL: undefined,
    GROQ_API_KEY: 'fake-real-key',
    GEMINI_API_KEY: 'mock',
  },
}));

// sharp normalises the image before encoding; stub it so we don't pull the
// native binding and we control the buffer length.
vi.mock('sharp', () => {
  const stub = Object.assign(
    (buf: Buffer) => ({
      rotate: () => ({ toBuffer: async () => buf }),
    }),
    { concurrency: vi.fn() },
  );
  return { default: stub };
});

// We mock global.fetch so each test scripts a different provider response.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

import { identifySticker } from '../../src/services/scan.service.js';

function groqResponse(content: string, finishReason = 'stop'): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('identifySticker (Groq provider) — happy path', () => {
  it('parses the JSON-mode response and applies the reconcileStickerType pass', async () => {
    const aiPayload = {
      stickers: [
        {
          stickerNumber: 5,
          albumCode: 'BRA5',
          playerName: 'Vinicius',
          teamFifaCode: 'BRA',
          variantToken: 'base_border',
          stickerType: null,
          confidence: 0.9,
          reasoning: 'matched border + jersey',
        },
        {
          stickerNumber: null,
          albumCode: 'EX12',
          playerName: 'Messi',
          teamFifaCode: 'ARG',
          variantToken: 'extra_gold',
          stickerType: 'extra',
          confidence: 0.95,
          reasoning: 'gold background, EX prefix',
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify(aiPayload)));

    const out = await identifySticker(Buffer.from('img'), 'image/jpeg');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ albumCode: 'BRA5', variantToken: 'base_border', stickerType: null });
    // EX-prefix decisively forces 'extra' via reconcileStickerType.
    expect(out[1]).toMatchObject({ albumCode: 'EX12', variantToken: 'extra_gold', stickerType: 'extra' });
  });

  it('accepts a top-level array as well as { stickers: [...] }', async () => {
    const aiPayload = [{
      stickerNumber: 7, albumCode: 'ARG7', playerName: 'X', teamFifaCode: 'ARG',
      variantToken: 'blue', stickerType: null, confidence: 0.5, reasoning: 'r',
    }];
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify(aiPayload)));
    const out = await identifySticker(Buffer.from('img'), 'image/jpeg');
    expect(out[0]?.albumCode).toBe('ARG7');
  });

  it('strips a ```json code fence the model added despite JSON-mode', async () => {
    const payload = '```json\n{"stickers":[{"albumCode":"COL4"}]}\n```';
    fetchMock.mockResolvedValueOnce(groqResponse(payload));
    const out = await identifySticker(Buffer.from('img'), 'image/jpeg');
    expect(out[0]?.albumCode).toBe('COL4');
  });

  it('sends the Authorization: Bearer <key> header on the Groq request', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse('{}'));
    await identifySticker(Buffer.from('img'), 'image/jpeg');
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe('Bearer fake-real-key');
    expect(headers['content-type']).toBe('application/json');
  });

  it('forces coca_cola_special stickers to base_borderless and null team', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({
      stickers: [{
        albumCode: 'CC4', playerName: 'Davies', teamFifaCode: 'CAN',
        variantToken: 'base_border', stickerType: 'coca_cola_special',
        confidence: 0.8, reasoning: '',
      }],
    })));
    const out = await identifySticker(Buffer.from('img'), 'image/jpeg');
    expect(out[0]).toMatchObject({
      stickerType: 'coca_cola_special',
      // The CC2 force kicks in even though the model said 'base_border'.
      variantToken: 'base_borderless',
      teamFifaCode: null,
    });
  });
});

describe('identifySticker (Groq provider) — error paths', () => {
  it('throws when Groq returns a non-ok status', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('rate limited', { status: 429 }),
    );
    await expect(identifySticker(Buffer.from('img'), 'image/jpeg')).rejects.toThrow(/Groq API error 429/);
  });

  it('throws when the model stops early (finish_reason != stop)', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse('{"stickers":[]}', 'length'));
    await expect(identifySticker(Buffer.from('img'), 'image/jpeg')).rejects.toThrow(/stopped early/);
  });

  it('throws with a debuggable preview when the model returns invalid JSON', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse('not json at all'));
    await expect(identifySticker(Buffer.from('img'), 'image/jpeg')).rejects.toThrow(/invalid JSON syntax/);
  });

  it('throws when the response has no text content at all', async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(''));
    await expect(identifySticker(Buffer.from('img'), 'image/jpeg')).rejects.toThrow(/No text response/);
  });
});

describe('identifySticker — mock pathway', () => {
  it('short-circuits to canned MOCK_RESULTS when the active provider key is "mock"', async () => {
    // Re-mock env to force the mock pathway for this case only.
    vi.doMock('../../src/env.js', () => ({
      env: {
        SCAN_PROVIDER: 'groq', SCAN_MODEL: undefined,
        GROQ_API_KEY: 'mock', GEMINI_API_KEY: 'fake',
      },
    }));
    vi.resetModules();
    const { identifySticker: mockIdentify } = await import('../../src/services/scan.service.js');
    const out = await mockIdentify(Buffer.from('img'), 'image/jpeg');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toHaveProperty('albumCode');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
