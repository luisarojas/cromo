-- Migration 0033: full rewrite of the FIFA WC 2026 scan prompt.
-- Replaces the prior incremental patches with a clean, authoritative prompt
-- grounded in the actual visual layout of each sticker type.

UPDATE album_types SET scan_prompt = $prompt$
ALBUM-SPECIFIC RULES FOR THIS COLLECTION (FIFA World Cup 2026 Panini):

══════════════════════════════════════════════════════════
STICKER TYPES — IDENTIFY THE TYPE FIRST
══════════════════════════════════════════════════════════

There are three sticker types. Determine the type before extracting any fields.

──────────────────────────────────────────────────────────
TYPE A: EXTRA STICKER  →  stickerType = "extra"
──────────────────────────────────────────────────────────
Front side shows ALL of the following:
  • The text "Extra Sticker" printed in the UPPER-RIGHT corner — this is the MANDATORY signal
  • The FIFA 2026 logo in the UPPER-LEFT corner
  • A country flag in the LOWER-LEFT corner (NOT lower-right — left side)
  • The player's name in the LOWER-CENTER

Back side: the album code in the center starts with "EX" (e.g. "EX1", "EX5").

CRITICAL: Do NOT classify a sticker as "extra" based on its finish, shininess, or foil texture alone. A shiny, metallic, or gold crumple finish on a sticker with a lower-RIGHT flag and no "Extra Sticker" label is a CORE sticker with a crumple borderColor — not an extra. If you cannot clearly read the text "Extra Sticker" in the upper-right corner (front) or an "EX"-prefixed album code (back), set stickerType = null.

Extract:
  playerName    — lower-center text on the front, or the printed name on the back
  teamFifaCode  — identify the country by visually recognising the circular flag image (lower-LEFT on the front); return its ISO 3-letter FIFA code
  albumCode     — from the back (will start with "EX")
  stickerNumber — integer printed on the back
  borderColor   — foil/parallel accent color on the sticker (e.g. "purple", "bronze",
                  "silver", "gold"), or null if no special foil is present

──────────────────────────────────────────────────────────
TYPE B: COCA-COLA SPECIAL  →  stickerType = "coca_cola_special"
──────────────────────────────────────────────────────────
These are promotional stickers. Their defining visual features:
  • The FIFA 2026 logo appears in the UPPER-LEFT corner
  • The player's name is printed ROTATED 90° (reads from bottom to top) along the LEFT edge
  • There is NO country flag, and NO horizontally printed player name
  • These stickers are single-sided — there is no back side with an album code

The rotated player name is the decisive signal. If you see a 90°-rotated name along the left edge, classify as coca_cola_special regardless of any other visual uncertainty.

Extract:
  playerName — the text rotated 90° along the left edge
  All other fields (albumCode, stickerNumber, teamFifaCode, borderColor) → null

──────────────────────────────────────────────────────────
TYPE C: CORE ALBUM STICKER  →  stickerType = null
──────────────────────────────────────────────────────────
Everything else: player stickers, team stickers, emblems, mascots, official art, etc.

PLAYER stickers (front side):
  • A player photo fills the center
  • The FIFA 2026 logo in the UPPER-RIGHT corner
  • The player's name is the FIRST LINE of text in the LOWER-CENTER (immediately above stats: D.O.B., height, weight, club)
  • A country flag on the LOWER-RIGHT to MIDDLE-RIGHT edge

NON-PLAYER stickers (team, emblem, mascot, tournament art, etc.):
  • No player photo; shows team or tournament imagery
  • Set playerName to null

All core stickers share a back side with:
  • An album code in the center (letters + digits, e.g. "BRA5", "FWC3", "MF1")
    — NEVER starts with "EX"
  • A plain-integer sticker number

Border / finish types for core stickers — set borderColor as follows:
  No visible border      → null          (base, borderless)
  White border           → "white"
  Blue border            → "blue"
  Red border             → "red"
  Purple border          → "purple"
  Green border           → "green"
  Black border           → "black"
  Orange border          → "orange"
  Gold crumple foil      → "gold_crumple"
  Blue crumple foil      → "blue_crumple"
  Red crumple foil       → "red_crumple"
  Purple crumple foil    → "purple_crumple"
  Green crumple foil     → "green_crumple"
  Black crumple foil     → "black_crumple_1of1"

  Crumple foil = a textured, crinkled metallic finish (not a flat coloured border).
  borderColor is always null for back-side scans.

Extract:
  playerName    — first line of text in the lower-center (front); null for non-player stickers
  teamFifaCode  — identify the country by visually recognising the circular flag image (lower-RIGHT on the front); return its ISO 3-letter FIFA code; null if no flag is clearly identifiable
  albumCode     — from the back
  stickerNumber — integer from the back
  borderColor   — as listed above

══════════════════════════════════════════════════════════
QUICK DISAMBIGUATION
══════════════════════════════════════════════════════════

Use this table when unsure which type a sticker is:

  Signal observed                          → Type
  ──────────────────────────────────────   ──────────────────────
  "Extra Sticker" text in upper-right      → extra
  Album code starts with "EX"              → extra
  Rotated player name along the left edge  → coca_cola_special
  Gold/silver/metallic finish, no EX code  → core (null), borderColor = "gold_crumple" etc.
  Shiny or foil sticker, no EX code        → core (null)
  Anything else                            → core (null)

A crumple or metallic foil finish NEVER changes stickerType — it only affects borderColor.

══════════════════════════════════════════════════════════
SIDE IDENTIFICATION
══════════════════════════════════════════════════════════

FRONT: Shows imagery (photo, crest, mascot, art). Has the FIFA 2026 logo in the upper-left.
BACK:  White/light background, printed text, album code. No imagery.

══════════════════════════════════════════════════════════
FIELD RULES
══════════════════════════════════════════════════════════

albumCode:
  • Format: letters then digits (e.g. "BRA5", "FWC3", "MF1", "EX5")
  • NEVER a standalone year — "2026" is not an album code
  • Only on the back side; set to null for front-side scans

stickerNumber:
  • A plain integer on the back (e.g. 247); null if not visible

teamFifaCode:
  • No text code is printed on the sticker — only a circular flag image appears
  • Visually identify the country from the flag design, then return its ISO 3-letter FIFA code (e.g. "BRA", "FRA", "ARG")
  • null if no flag is clearly identifiable

══════════════════════════════════════════════════════════
CONFIDENCE GUIDELINES
══════════════════════════════════════════════════════════

  0.90-1.00  albumCode AND stickerNumber both clearly legible
  0.70-0.89  Only one of albumCode or stickerNumber legible, or playerName clearly readable
  0.40-0.69  Partial information; some fields inferred from context
  0.10-0.39  Very little legible; high uncertainty
  0.00       Nothing identifiable
$prompt$
WHERE key = 'fifa_world_cup_2026';
