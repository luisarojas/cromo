import sharp from 'sharp';
import { env } from '../env.js';

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

const MOCK_RESULTS: ScanResult[] = [
  {
    stickerNumber: 247,
    albumCode: 'BRA5',
    playerName: 'Vinicius Jr.',
    teamFifaCode: 'BRA',
    variantToken: null,
    stickerType: null,
    confidence: 0.94,
    reasoning: 'Mock response — AI scanning disabled in local mode',
  },
];

function buildIdentifyPrompt(collectionName: string, scanPrompt?: string | null): string {
  return `You are identifying ${collectionName} stickers from a photo.

The photo may contain ONE sticker or MULTIPLE stickers. Identify ALL stickers that are clearly visible.
${scanPrompt ? `\n${scanPrompt}\n` : ''}

══════════════════════════════════════════════════════════
GENERIC GUARDRAILS (APPLY TO EVERY ALBUM)
══════════════════════════════════════════════════════════
G1. The album-specific rules above are AUTHORITATIVE for sticker types, variant tokens, and rarity classifications. The variant-token output field is a canonical token chosen from the album's variant vocabulary, NOT a free-form description — return only tokens the album rules list, and return null if no listed token clearly applies. Never invent a stickerType or variant token value.
G2. Sticker designs (which visual feature distinguishes variants — an outer rim, a foil pattern, a background tier, a holographic effect, a corner stamp, etc.) are defined PER ALBUM. Read the album-specific rules above for the exact disambiguation signal, and base your variant-token decision on THAT signal. Do not assume conventions from other collections.
G3. Do not confuse the surface UNDER the sticker (tabletop, scanning mat, plastic sleeve, fingers) with the sticker itself. Everything outside the physical cut edge of the sticker is irrelevant.
G4. Attempt the player/subject name whenever there is legible text on the sticker. Transcribe it character-by-character. Foreign, long, or unfamiliar names are valid — do NOT return null just because the name looks unusual or you do not recognise the subject. Only return null when the text region is fully obliterated by glare, blur, occlusion, or back-side photography.

══════════════════════════════════════════════════════════
MANDATORY REASONING PROTOCOL
══════════════════════════════════════════════════════════
For EVERY sticker, the "reasoning" field MUST be a single string that contains these five labelled lines, in order, before any free-text commentary:

  LAYOUT:      <one short sentence describing the overall layout: photo style, where the name sits, presence/absence of stats line, flag, logo, etc.>.
  VARIANT_SIGNAL: <plain-English description of the specific visual feature the album rules use to distinguish variants (e.g. the outer rim color, the foil texture, the background tier, the corner stamp). Describe ONLY that feature, in its own words, before mapping to a token.>.
  INTERIOR:    <plain-English description of nearby elements that could be confused with the variant signal (name bar color, photo background, decorative accents), explicitly noted so they are NOT confused with the variant signal.>.
  TYPE_TEST:   <walk through the album-specific rules above to decide stickerType.>.
  TOKEN_PICK:  <state the chosen variant token and stickerType, and justify why your VARIANT_SIGNAL observation maps to that token under the album rules.>.

After those five lines, you may add one short free-text sentence. The whole reasoning string MUST be under 600 characters.

══════════════════════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════════════════════
Respond with a valid JSON object containing a "stickers" key holding an array of objects. Use these exact keys for each sticker:
stickerNumber, albumCode, playerName, teamFifaCode, variantToken, stickerType, confidence, reasoning

Set any field that is not visible or not applicable to null. Do NOT invent values.

albumCode is the code printed on the BACK of a sticker (e.g. "BRA5", "EX12", "CC4"). When you are looking at the FRONT of a sticker, this code is NOT visible — leave albumCode null. When you are looking at the BACK of a sticker, the code is the ONLY information available — return the code as albumCode and leave the other classification fields (stickerType, variantToken, playerName, stickerNumber, teamFifaCode) null. The backend resolves those from the code.

Output Format Template:
{
  "stickers": [
    { "stickerNumber": 12, "albumCode": null,  "playerName": "NEYMAR JR", "teamFifaCode": "BRA", "variantToken": "<token from album rules>", "stickerType": null, "confidence": 0.95, "reasoning": "LAYOUT: <…>. VARIANT_SIGNAL: <…>. INTERIOR: <…>. TYPE_TEST: <…>. TOKEN_PICK: <…>." },
    { "stickerNumber": null, "albumCode": "ARG7", "playerName": null,        "teamFifaCode": null,  "variantToken": null,                       "stickerType": null, "confidence": 0.95, "reasoning": "LAYOUT: back side of sticker, only album code visible. VARIANT_SIGNAL: n/a (back side). INTERIOR: n/a. TYPE_TEST: skipped, back side. TOKEN_PICK: backend resolves from albumCode ARG7." }
  ]
}`;
}

const MAX_RETRIES = 3;

function parseRetryAfterMs(responseBody: string, headers: Headers): number {
  const retryAfterHeader = headers.get('retry-after');
  if (retryAfterHeader) {
    const seconds = parseFloat(retryAfterHeader);
    if (!isNaN(seconds)) return Math.ceil(seconds * 1000) + 500;
  }
  const match = responseBody.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  return 10_000;
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

  const requestBody = JSON.stringify({
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
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.GROQ_API_KEY}`,
        'content-type': 'application/json',
      },
      body: requestBody,
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status !== 429) break;

    if (attempt === MAX_RETRIES) break;

    const errorText = await response.text().catch(() => '');
    const delayMs = parseRetryAfterMs(errorText, response.headers);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  if (!response!.ok) {
    const text = await response!.text().catch(() => response!.statusText);
    throw new Error(`Groq API error ${response!.status}: ${text}`);
  }

  const data = await response!.json() as {
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
    const rawVariantToken = typeof p['variantToken'] === 'string' ? p['variantToken'] : null;

    const rawType = p['stickerType'] === 'extra' ? 'extra'
      : p['stickerType'] === 'coca_cola_special' ? 'coca_cola_special'
        : null;

    const stickerType = reconcileStickerType(rawType, albumCode, rawVariantToken);
    const variantToken = stickerType === 'coca_cola_special' ? 'base_borderless' : rawVariantToken;

    return {
      stickerNumber: typeof p['stickerNumber'] === 'number' ? p['stickerNumber'] : null,
      albumCode,
      playerName: typeof p['playerName'] === 'string' ? p['playerName'] : null,
      teamFifaCode: stickerType === 'coca_cola_special' ? null : (typeof p['teamFifaCode'] === 'string' ? p['teamFifaCode'] : null),
      variantToken,
      stickerType,
      confidence: typeof p['confidence'] === 'number' ? p['confidence'] : 0,
      reasoning: typeof p['reasoning'] === 'string' ? p['reasoning'] : '',
    };
  });
}

// Extra stickers require POSITIVE structural evidence — either an "EX"-prefixed album
// code (back-side decisive signal) or an extra_* variantToken (front-side decisive
// signal). Without one of those, the model is almost certainly mistaking a shiny/foil
// core sticker for an Extra. Trust the structured fields over the type label.
const CRUMPLE_VARIANTS = new Set([
  'gold_crumple', 'blue_crumple', 'red_crumple',
  'purple_crumple', 'green_crumple', 'black_crumple',
]);

function reconcileStickerType(
  rawType: 'extra' | 'coca_cola_special' | null,
  albumCode: string | null,
  variantToken: string | null,
): 'extra' | 'coca_cola_special' | null {
  // Back-of-sticker scans only carry an album code. The code's prefix is a
  // decisive signal for stickerType, overriding any guess the model made when
  // it had no front-side evidence to read from.
  if (albumCode?.startsWith('EX') && rawType !== 'coca_cola_special') return 'extra';
  if (albumCode?.startsWith('CC') && rawType !== 'extra') return 'coca_cola_special';

  if (rawType === 'extra') {
    // Crumple variants are a core-only finish — extra stickers never have them.
    // If the model returned a crumple variantToken it misidentified the sticker.
    if (variantToken && CRUMPLE_VARIANTS.has(variantToken)) return null;
    if (albumCode && !albumCode.startsWith('EX')) return null;
    if (!variantToken?.startsWith('extra_')) return null;
  }

  return rawType;
}
