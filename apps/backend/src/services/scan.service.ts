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

CRITICAL: You must respond with a valid JSON object containing a "stickers" key holding an array of objects. 
Use these exact keys for each sticker:
stickerNumber, albumCode, playerName, teamFifaCode, borderColor, stickerType, confidence, reasoning

Set any field that is not visible or not applicable to null.
Output Format Template:
{
  "stickers": [
    { "stickerNumber": 12, "albumCode": "BRA5", "playerName": "Neymar Jr", "teamFifaCode": "BRA", "borderColor": "blue", "stickerType": null, "confidence": 0.95, "reasoning": "..." }
  ]
}`;
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
      max_tokens: 3000, // Raised to prevent JSON clipping on complex/multiple extractions
      temperature: 0,
      response_format: { type: 'json_object' }, // Tells Groq natively to return structured JSON
      messages: [
        {
          role: 'system',
          content: 'You are a strict data extraction engine. Follow all visual formatting classification instructions exactly. Never include conversational prose.',
        },
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

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Groq API returned invalid JSON syntax');
  }

  // Gracefully handle both the preferred wrapper object or an array fallback
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : (parsed.stickers && Array.isArray(parsed.stickers) ? parsed.stickers : [parsed]);

  return items.map((item): ScanResult => {
    const p = item as Record<string, unknown>;

    // Explicit camelCase parsing to align with ScanResult type signatures
    const albumCode = typeof p['albumCode'] === 'string' && p['albumCode'].length > 0 ? p['albumCode'] : null;
    const rawBorderColor = typeof p['borderColor'] === 'string' ? p['borderColor'] : null;

    const rawType = p['stickerType'] === 'extra' ? 'extra'
      : p['stickerType'] === 'coca_cola_special' ? 'coca_cola_special'
        : null;

    const stickerType = reconcileStickerType(rawType, albumCode, rawBorderColor);
    const borderColor = stickerType === 'coca_cola_special' ? 'base_borderless' : rawBorderColor;

    return {
      stickerNumber: typeof p['stickerNumber'] === 'number' ? p['stickerNumber'] : null,
      albumCode, // Fixed variable mapping and casing alignment
      playerName: typeof p['playerName'] === 'string' ? p['playerName'] : null,
      teamFifaCode: stickerType === 'coca_cola_special' ? null : (typeof p['teamFifaCode'] === 'string' ? p['teamFifaCode'] : null),
      borderColor,
      stickerType,
      confidence: typeof p['confidence'] === 'number' ? p['confidence'] : 0,
      reasoning: typeof p['reasoning'] === 'string' ? p['reasoning'] : '',
    };
  });
}

// Extra stickers require POSITIVE structural evidence — either an "EX"-prefixed album
// code (back-side decisive signal) or an extra_* borderColor (front-side decisive
// signal). Without one of those, the model is almost certainly mistaking a shiny/foil
// core sticker for an Extra. Trust the structured fields over the type label.
const CRUMPLE_BORDERS = new Set([
  'gold_crumple', 'blue_crumple', 'red_crumple',
  'purple_crumple', 'green_crumple', 'black_crumple_1of1',
]);

function reconcileStickerType(
  rawType: 'extra' | 'coca_cola_special' | null,
  albumCode: string | null,
  borderColor: string | null,
): 'extra' | 'coca_cola_special' | null {
  if (albumCode?.startsWith('EX') && rawType !== 'coca_cola_special') return 'extra';

  if (rawType === 'extra') {
    // Crumple borders are a core-only finish — extra stickers never have them.
    // If the model returned a crumple borderColor it misidentified the sticker.
    if (borderColor && CRUMPLE_BORDERS.has(borderColor)) return null;
    if (albumCode && !albumCode.startsWith('EX')) return null;
    if (!borderColor?.startsWith('extra_')) return null;
  }

  return rawType;
}
