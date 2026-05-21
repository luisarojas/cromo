-- Migration 0031: add scan_prompt to album_types.
-- Stores album-type-specific instructions injected into the AI scan prompt,
-- replacing the hardcoded ALBUM_TYPE_HINTS registry in scan.service.ts.
-- NULL means no album-specific hints; the base prompt is used as-is.

ALTER TABLE album_types ADD COLUMN scan_prompt text;

UPDATE album_types SET scan_prompt = $prompt$
ALBUM-SPECIFIC RULES FOR THIS COLLECTION (FIFA World Cup 2026 Panini):

═══════════════════════════════════════════════════════════
STEP 1 — IDENTIFY SPECIAL STICKER TYPES FIRST
Check for these before applying the standard front/back rules below.
═══════════════════════════════════════════════════════════

EXTRA STICKER: A sticker is an extra if ANY of the following are true:
  - The text "Extra Sticker" appears in the UPPER-RIGHT corner of the front side.
  - The text "Extra Sticker" appears anywhere on the back side.
  → Set stickerType = "extra".
  → Still extract all other fields normally (albumCode, stickerNumber, playerName, etc.)
     using the FRONT/BACK rules in STEP 3 below.

COCA-COLA STICKER: A sticker is a Coca-Cola special if ALL of the following are true:
  - There is a FIFA logo in the upper-left corner.
  - The player's name is printed VERTICALLY along the lower-left edge.
  - There is NO album code anywhere on the sticker.
  → Set stickerType = "coca_cola_special"
  → Set playerName from the vertically printed text.
  → Set teamFifaCode, borderColor, albumCode, stickerNumber all to null.
  → Do NOT apply STEP 2 or STEP 3 for this sticker type.

═══════════════════════════════════════════════════════════
STEP 2 — DETERMINE WHICH SIDE IS VISIBLE
═══════════════════════════════════════════════════════════

FRONT side: Shows a player photo or team/tournament image. May include the player's name,
  the country flag, and a border along the edge of the card.

BACK side: Shows a white/light background with an album code (letters + digits, e.g. "BRA5",
  "FWC3", "MF1"), a sticker number, a player name, and descriptive text. Never shows a player photo.

═══════════════════════════════════════════════════════════
STEP 3 — EXTRACT FIELDS FROM THE VISIBLE SIDE
═══════════════════════════════════════════════════════════

── FRONT SIDE ──

teamFifaCode:
  - The country flag in the LOWER-RIGHT corner is the primary signal.
  - Read the ISO 3-letter FIFA country code from the flag (e.g. "BRA", "FRA", "ARG").
  - If no flag is visible, set to null.

stickerType:
  - If the text "Extra Sticker" appears in the UPPER-RIGHT corner → set stickerType = "extra".
  - Otherwise set to null.

borderColor:
  - Read the dominant color of the decorative border around the card edge.
  - Use a common English color name (e.g. "gold", "silver", "blue", "red").
  - If no border is visible, set to null.

playerName:
  - The first line of text in the LOWER-CENTRE of the sticker is always the player's name.
  - Set to null if not clearly visible.

albumCode, stickerNumber:
  - These are NOT printed on the front. Set both to null.

── BACK SIDE ──

albumCode:
  - Always a sequence of letters followed by digits (e.g. "BRA5", "FWC3", "MF1").
  - NEVER a standalone year like "2026" — that is not an album code.
  - If no valid code is found, set to null.

stickerNumber:
  - A plain integer printed on the back (e.g. 247). Set to null if not visible.

playerName:
  - Read from the printed player name on the back. Set to null if not visible.

teamFifaCode:
  - May appear as a 3-letter code alongside the player name or team section on the back.
  - Set to null if not clearly present.

stickerType:
  - If the text "Extra Sticker" appears anywhere on the back → set stickerType = "extra".
  - Otherwise set to null.

borderColor:
  - Not visible on the back. Set to null.

═══════════════════════════════════════════════════════════
STEP 4 — CONFIDENCE GUIDELINES
═══════════════════════════════════════════════════════════

Set confidence based on how much identifying information was clearly readable:
  - 0.90-1.00: albumCode AND stickerNumber both clearly legible.
  - 0.70-0.89: Only one of albumCode or stickerNumber legible, or playerName clearly readable.
  - 0.40-0.69: Partial information; some fields inferred from context.
  - 0.10-0.39: Very little legible; high uncertainty.
  - 0.00: Nothing identifiable.
$prompt$
WHERE key = 'fifa_world_cup_2026';
