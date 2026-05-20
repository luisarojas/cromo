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

First decide which side of the sticker is shown:
- FRONT: player photo with the player's name printed on it; may have a coloured border
- BACK: plain printed text containing the album code and sticker number

Extract ONLY what is physically visible on the side shown. Set everything else to null.

FRONT side — extract:
- playerName: the player's full name as printed
- teamFifaCode: three-letter FIFA code visible on the sticker (e.g. "BRA", "FRA"), or null
- borderColor: border colour if a parallel variant is present (e.g. "gold", "silver", "blue"), or null
- albumCode: null (not on the front)
- stickerNumber: null (not on the front)

BACK side — extract:
- albumCode: the album code printed on the back (e.g. "BRA5", "FWC3")
- stickerNumber: the sticker number printed on the back (integer)
- playerName: null (not on the back)
- teamFifaCode: null (not on the back)
- borderColor: null (not on the back)

Always include:
- confidence: your confidence as a float between 0.0 and 1.0
- reasoning: one sentence explaining your identification

Respond ONLY with a valid JSON object using these exact keys. No markdown, no explanation outside the JSON.`;

export async function identifySticker(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ScanResult> {
  if (env.GROQ_API_KEY === 'mock') {
    return MOCK_RESULT;
  }

  const base64Image = imageBuffer.toString('base64');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 512,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
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
    throw new Error(`Groq API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('No text response from Groq API');
  }

  // Strip markdown code fences if the model wraps the JSON
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error('Groq API returned non-JSON response');
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
