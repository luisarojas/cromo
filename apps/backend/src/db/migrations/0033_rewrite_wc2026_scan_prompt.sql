-- Migration 0033: full rewrite of the FIFA WC 2026 scan prompt.
-- Structured around the single most reliable visual signal — the FIFA 2026
-- logo position — which is a clean binary classifier for core vs special
-- stickers. All other type heuristics are subordinated to that signal.

UPDATE album_types SET scan_prompt = $prompt$
ALBUM-SPECIFIC RULES FOR FIFA WORLD CUP 2026 (PANINI):

══════════════════════════════════════════════════════════
OVERRIDING RULES — APPLY BEFORE EVERY DECISION
══════════════════════════════════════════════════════════

1. Logo position decides the TYPE FAMILY. Shine, foil, gold, metallic, holographic, or
   crumple finish NEVER reclassifies a core sticker as a special one.
2. The border is ONLY the outermost coloured stripe at the sticker's edge. The inner
   name bar and the photo background are never the border, regardless of their colour.
3. A national team kit is NOT a country flag. Do not infer teamFifaCode from kit colour.
4. Read playerName from printed text letter by letter. Return null rather than guessing
   from face, hair, kit, or context.

══════════════════════════════════════════════════════════
STEP 1 — IDENTIFY SIDE, THEN TYPE FAMILY
══════════════════════════════════════════════════════════

A sticker has a FRONT (imagery + FIFA 2026 logo) and a BACK (white or blue background, printed
text only, album code in the center, no imagery).

FRONT scans — classify by FIFA 2026 logo position (PRIMARY classifier):
  Logo in UPPER-RIGHT  →  CORE sticker     →  §A
  Logo in UPPER-LEFT   →  SPECIAL sticker  →  §B

BACK scans — classify by album code prefix:
  Album code starts with "EX"  →  stickerType = "extra"
  Any other prefix             →  stickerType = null  (core)
  borderColor is always null for back-side scans.

══════════════════════════════════════════════════════════
§A — CORE STICKER  (logo upper-right)  →  stickerType = null
══════════════════════════════════════════════════════════

Front layout:
  • Logo: UPPER-RIGHT corner
  • Photo: POSED STUDIO PORTRAIT — chest-up, stationary subject over a clean gradient,
    geometric pattern, or matte background. Never an action shot with a blurred crowd.
  • Lower-center: rounded name bar holding the player's name (first line of text),
    then stats line (D.O.B., height, weight, club)
  • Lower-right / middle-right edge: circular country flag
  • Non-player stickers (team, emblem, mascot, tournament art): no player photo, no
    flag — set playerName and teamFifaCode to null

Holographic / shiny / crumple-foil CORE variants:
  Parallel variants exist whose foil texture covers most of the visible area, not just
  a thin border. They keep the standard core layout (logo upper-right, posed portrait,
  name bar, stats) and often carry "PANINI ONLINE EXCLUSIVE" along the top edge. They
  are STILL CORE — set stickerType = null and use the matching "_crumple" borderColor.

Back layout:
  • Album code in the center: letters + digits (e.g. "BRA5", "FWC3", "MF1") — never
    starts with "EX"
  • Plain-integer sticker number

Extract:
  stickerType    → null
  playerName     → first line of lower-center text (null for non-player stickers)
  teamFifaCode   → ISO 3-letter code from the lower-right flag (null if no flag)
  albumCode      → from the back (null on front-side scans)
  stickerNumber  → integer from the back
  borderColor    → see table below

borderColor for CORE stickers (front-side only; back-side → null):
  No visible outer stripe   → null              (base, borderless)
  Solid white outer stripe  → "white"
  Solid blue outer stripe   → "blue"
  Solid red outer stripe    → "red"
  Solid purple outer stripe → "purple"
  Solid green outer stripe  → "green"
  Solid black outer stripe  → "black"
  Solid orange outer stripe → "orange"
  Gold crumple foil         → "gold_crumple"
  Blue crumple foil         → "blue_crumple"
  Red crumple foil          → "red_crumple"
  Purple crumple foil       → "purple_crumple"
  Green crumple foil        → "green_crumple"
  Black crumple foil        → "black_crumple_1of1"

  Crumple foil = textured, crinkled metallic finish (not a flat colour).

══════════════════════════════════════════════════════════
§B — SPECIAL STICKER  (logo upper-left)
══════════════════════════════════════════════════════════

Two sub-types share the upper-left logo. Any ONE decisive signal settles the type.
The two sets are mutually exclusive — a sticker is either Extra or Coca-Cola, never
both. If no Extra signal is present on a logo-upper-left sticker, the default is
Coca-Cola.

EXTRA  (stickerType = "extra")  →  §B.1
  Decisive (any one):
    • "Extra Sticker" or "Panini Extra" text/logo in the frame
    • Album code on the back starts with "EX"
    • Holographic foil border in Purple, Bronze, Silver, or Gold (Extra-only palette)
  Supporting:
    • Country flag in the LOWER-LEFT corner
    • Live-action match photo (running, dribbling, celebrating)
    • Blurred stadium / field background
  Hard negative: never a posed stationary studio portrait.

COCA-COLA SPECIAL  (stickerType = "coca_cola_special")  →  §B.2
  Decisive (any one):
    • Player name printed VERTICALLY (rotated 90°) up the LEFT edge
    • Logo upper-left AND every Extra signal above is absent (no Extra/Panini Extra
      label, no lower-left flag, no "EX"-prefixed album code, no Extra foil border)
  Supporting:
    • Dynamic action photo (celebrating, mid-play) that fills the sticker
    • Single-sided: no back exists
    • Roster of ~12 international promotional stars (Lamine Yamal, Alphonso Davies,
      Harry Kane, Weston McKennie, etc.) — unfamiliar names suggest NOT Coca-Cola
  Note: Coca-Cola Specials carry NO on-sticker Coca-Cola branding (no script logo, no
  hashtag, no wave/ribbon, no Coca-Cola red graphics). The "Coca-Cola" name refers to
  the distribution promotion, not on-sticker art.

──────────────────────────────────────────────────────────
§B.1 — EXTRA STICKER  →  stickerType = "extra"
──────────────────────────────────────────────────────────
Front layout:
  • Logo: UPPER-LEFT corner
  • "Extra Sticker" or "Panini Extra" text/logo (upper-right or in the foil frame)
  • Country flag in the LOWER-LEFT corner (not lower-right)
  • Player name in the lower-center
  • Live-action match photo with blurred stadium / field background

Back layout:
  • Album code in the center starts with "EX" (e.g. "EX1", "EX5")
  • Plain-integer sticker number

Extract:
  stickerType    → "extra"
  playerName     → lower-center text (front) or printed name (back)
  teamFifaCode   → ISO 3-letter code from the lower-LEFT flag
  albumCode      → from the back (starts with "EX")
  stickerNumber  → integer from the back
  borderColor    → one of: "extra_purple", "extra_bronze", "extra_silver", "extra_gold"
                   (Purple is the base parallel; Bronze, Silver, Gold are rarer tiers).
                   Never a "_crumple" value.

──────────────────────────────────────────────────────────
§B.2 — COCA-COLA SPECIAL  →  stickerType = "coca_cola_special"
──────────────────────────────────────────────────────────
Front layout:
  • Logo: UPPER-LEFT corner
  • Player name printed VERTICALLY (rotated 90°, reads bottom-to-top) up the LEFT
    edge — text runs UP the side, not horizontally. This is the strongest positive
    signal.
  • Dynamic action photo (celebrating, mid-play) that fills the sticker
  • Player usually pictured in their national team kit (kit ≠ flag)
  • No "Extra"/"Panini Extra" label, no country flag in the lower-left, no horizontal
    player name, no album code visible
  • NO Coca-Cola branding on the sticker — no script logo, no hashtag, no wave/ribbon
    graphics, no Coca-Cola red. Do not look for any of those.

Single-sided: no back exists.

Roster check: the Coca-Cola set is limited to ~12 international promotional stars
(Lamine Yamal, Alphonso Davies, Harry Kane, Weston McKennie, etc.). If the printed
name you read isn't a recognisable high-profile international, re-check the
vertical-text signal before committing.

Extract:
  stickerType    → "coca_cola_special"
  playerName     → the vertical text along the left edge (read literally; null if any
                   letter unreadable)
  All other fields (albumCode, stickerNumber, teamFifaCode, borderColor) → null

══════════════════════════════════════════════════════════
FIELD RULES
══════════════════════════════════════════════════════════

albumCode:
  • Letters then digits (e.g. "BRA5", "FWC3", "MF1", "EX5"); never a bare year
  • Back side only — null on front-side scans

stickerNumber:
  • Plain integer on the back; null if not visible

teamFifaCode:
  • Read from the circular flag image; return the ISO 3-letter FIFA code
  • A player's kit colour is NOT a flag
  • null if no flag is clearly identifiable

playerName:
  • Read printed text letter by letter from the sticker itself
  • Never guess from face, hair, age, kit, or apparent team
  • null if any letter is obscured, blurred, or unreadable

borderColor:
  • Inspect ONLY the outermost coloured stripe at the sticker's edge
  • The inner name bar, photo background, and surface the sticker rests on are NEVER
    the border

confidence:
  • Return any number in [0, 1]; not displayed. Focus effort on the other fields.
$prompt$
WHERE key = 'fifa_world_cup_2026';
