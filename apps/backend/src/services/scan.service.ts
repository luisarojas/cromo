import { env } from '../env.js';

export interface ScanResult {
  stickerNumber: number | null;
  albumCode: string | null;
  playerName: string | null;
  teamFifaCode: string | null;
  borderColor: string | null;
  confidence: number;
  reasoning: string;
}

const MOCK_RESULT: ScanResult = {
  stickerNumber: 247,
  albumCode: 'BRA5',
  playerName: 'Vinicius Jr.',
  teamFifaCode: 'BRA',
  borderColor: null,
  confidence: 0.94,
  reasoning: 'Mock response — AI scanning disabled in local mode',
};

const IDENTIFY_PROMPT = `You are identifying a Panini FIFA World Cup 2026 sticker.

Analyse the image and provide:
1. stickerNumber — the sticker number printed on the sticker (integer)
2. albumCode — the album code shown on the sticker (e.g. "BRA5", "FWC3")
3. playerName — the player's name if this is a player sticker, otherwise null
4. teamFifaCode — the three-letter FIFA team code (e.g. "BRA", "FRA", "ARG"), or null for non-team stickers
5. borderColor — the border colour if a parallel variant is visible (e.g. "gold", "silver", "blue"), otherwise null
6. confidence — your confidence level as a float between 0.0 and 1.0
7. reasoning — one sentence explaining your identification

Respond ONLY with a valid JSON object using these exact keys. No markdown, no explanation outside the JSON.`;

export async function identifySticker(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ScanResult> {
  if (env.CLAUDE_API_KEY === 'mock') {
    return MOCK_RESULT;
  }

  const base64Image = imageBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: IDENTIFY_PROMPT,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Claude API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    content: { type: string; text?: string }[];
  };

  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text response from Claude API');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text) as Record<string, unknown>;
  } catch {
    throw new Error('Claude API returned non-JSON response');
  }

  return {
    stickerNumber: typeof parsed['stickerNumber'] === 'number' ? parsed['stickerNumber'] : null,
    albumCode: typeof parsed['albumCode'] === 'string' ? parsed['albumCode'] : null,
    playerName: typeof parsed['playerName'] === 'string' ? parsed['playerName'] : null,
    teamFifaCode: typeof parsed['teamFifaCode'] === 'string' ? parsed['teamFifaCode'] : null,
    borderColor: typeof parsed['borderColor'] === 'string' ? parsed['borderColor'] : null,
    confidence: typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0,
    reasoning: typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
  };
}
