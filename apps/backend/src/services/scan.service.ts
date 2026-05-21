import sharp from 'sharp';
import { env } from '../env.js';

export interface ScanResult {
  stickerNumber: number | null;
  albumCode: string | null;
  playerName: string | null;
  teamFifaCode: string | null;
  borderColor: string | null;
  stickerType: string | null;
  confidence: number;
  reasoning: string;
}

const MOCK_RESULTS: ScanResult[] = [
  {
    stickerNumber: 247,
    albumCode: 'BRA5',
    playerName: 'Vinicius Jr.',
    teamFifaCode: 'BRA',
    borderColor: null,
    stickerType: null,
    confidence: 0.94,
    reasoning: 'Mock response — AI scanning disabled in local mode',
  },
];

function buildIdentifyPrompt(collectionName: string, scanPrompt?: string | null): string {
  return `You are identifying ${collectionName} stickers from a photo.

The photo may contain ONE sticker or MULTIPLE stickers. Identify ALL stickers that are clearly visible.
${scanPrompt ? `\n${scanPrompt}\n` : ''}
Respond ONLY with a valid JSON array. Each object must use these exact keys:
stickerNumber, albumCode, playerName, teamFifaCode, borderColor, stickerType, confidence, reasoning

Set any field that is not visible or not applicable to null.
Return an array even if only one sticker is visible. No markdown, no explanation outside the JSON.`;
}

export async function identifySticker(
  imageBuffer: Buffer,
  mimeType: string,
  collectionName = 'sticker collection',
  scanPrompt?: string | null,
): Promise<ScanResult[]> {
  if (env.GROQ_API_KEY === 'mock') {
    return MOCK_RESULTS;
  }

  const normalizedBuffer = await sharp(imageBuffer).rotate().toBuffer();
  const base64Image = normalizedBuffer.toString('base64');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1024,
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
              text: buildIdentifyPrompt(collectionName, scanPrompt),
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Groq API returned non-JSON response');
  }

  const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

  return items.map((item) => {
    const p = item as Record<string, unknown>;
    return {
      stickerNumber: typeof p['stickerNumber'] === 'number' ? p['stickerNumber'] : null,
      albumCode: typeof p['albumCode'] === 'string' && p['albumCode'].length > 0 ? p['albumCode'] : null,
      playerName: typeof p['playerName'] === 'string' ? p['playerName'] : null,
      teamFifaCode: typeof p['teamFifaCode'] === 'string' ? p['teamFifaCode'] : null,
      borderColor: typeof p['borderColor'] === 'string' ? p['borderColor'] : null,
      stickerType: p['stickerType'] === 'extra' ? 'extra'
        : p['stickerType'] === 'coca_cola_special' ? 'coca_cola_special'
        : null,
      confidence: typeof p['confidence'] === 'number' ? p['confidence'] : 0,
      reasoning: typeof p['reasoning'] === 'string' ? p['reasoning'] : '',
    };
  });
}
