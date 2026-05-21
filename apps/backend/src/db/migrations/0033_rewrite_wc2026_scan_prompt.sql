-- Migration 0033: full rewrite of the FIFA WC 2026 scan prompt.
-- Structured around the single most reliable visual signal — the FIFA 2026
-- logo position — which is a clean binary classifier for core vs special
-- stickers. All other type heuristics are subordinated to that signal.

UPDATE album_types SET scan_prompt = $prompt$
ALBUM-SPECIFIC RULES FOR FIFA WORLD CUP 2026 (PANINI):

══════════════════════════════════════════════════════════
OVERRIDING RULES — APPLY BEFORE EVERY DECISION
══════════════════════════════════════════════════════════

1. THREE STICKER TYPES, ONE PER VISUAL TEST. Use these tests in order. The FIRST that
   matches wins. Do not "second-guess" once a test matches.

   TEST 1 — Does the sticker show a STATS LINE under the player's name
            (date of birth + height + weight + club)?
            ⇒ YES → CORE  (stickerType = null). Stop. Read foil/border as a CORE
              parallel — even if the surface is gold, holographic, or crumpled.
            ⇒ NO  → continue to Test 2.

   TEST 2 — Can you LITERALLY READ the printed text "Extra Sticker" or "Panini Extra"
            on the front, OR does a back-side album code start with "EX"?
            (The word "PANINI" alone is the brand logo and does NOT count. "PANINI
            ONLINE EXCLUSIVE" is a CORE parallel marker, NOT an Extra marker.)
            ⇒ YES → EXTRA  (stickerType = "extra"). Stop.
            ⇒ NO  → continue to Test 3.

   TEST 3 — Default. The sticker is COCA-COLA SPECIAL
            (stickerType = "coca_cola_special").
            Typical features: action/celebration photo, player name printed vertically
            up the left edge, no stats, no horizontal name bar. The player may be
            anyone — DO NOT downgrade based on whether you recognise the name.

2. BORDER IS THE PERIMETER. The border is the colour you can trace continuously around
   ALL FOUR edges of the sticker. If a coloured region does not touch all four edges,
   it is NOT the border. The name bar is a rounded rectangle INSIDE the photo area and
   is NEVER the border, regardless of its colour.

3. NAME IS PRINTED TEXT ONLY. Transcribe the printed name as you see it; never infer
   from face, hair, kit, or team. UNFAMILIAR NAMES STILL COUNT — names from
   Uzbekistan, Iran, Senegal, Korea, etc. are valid and must be transcribed letter by
   letter even if they look unusual or hard to pronounce. Return null only when the
   text is physically obscured (motion blur, glare, plastic sleeve covering letters),
   never because the resulting name is unfamiliar.

4. KIT ≠ FLAG. A national team kit is not a country flag. Do not infer teamFifaCode
   from kit colour. A country abbreviation in parentheses inside vertical name text
   (e.g. "JEFFERSON LERMA (COL)") is part of the player-name text, not a flag.

══════════════════════════════════════════════════════════
STEP 1 — IDENTIFY SIDE
══════════════════════════════════════════════════════════

FRONT: imagery + FIFA 2026 logo. Apply the three tests in OVERRIDING RULES §1.

BACK: white or light background, printed text only, album code in the center, no
imagery. Classification on backs is by album-code prefix alone:
  Album code starts with "EX"  →  stickerType = "extra"
  Any other prefix             →  stickerType = null  (core)
  Coca-Cola stickers have no back; if you are seeing a back, it is not Coca-Cola.
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
  Solid blue outer stripe   → "blue"   (sky-blue / denim — cool blue, NOT violet)
  Solid red outer stripe    → "red"
  Solid purple outer stripe → "purple" (violet / grape / eggplant — REDDISH-blue)
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

  BLUE vs PURPLE: this is the most common colour confusion. Blue leans toward CYAN
  (cool, like the sky or a clear ocean). Purple leans toward RED (warm, like grapes
  or a bruise). If the colour has ANY warm/red undertone, it is purple. If it is a
  clean cool blue with no red tint, it is blue.

══════════════════════════════════════════════════════════
§B — EXTRA  (Test 2 matched)  →  stickerType = "extra"
══════════════════════════════════════════════════════════
Front layout: live-action match photo, blurred stadium background, country flag in
the LOWER-LEFT corner, player name horizontal in lower-center, "Extra Sticker" or
"Panini Extra" text visible somewhere on the front.

Extract:
  stickerType    → "extra"
  playerName     → lower-center text (front) or printed name (back)
  teamFifaCode   → ISO 3-letter code from the lower-LEFT flag
  albumCode      → from the back (starts with "EX")
  stickerNumber  → integer from the back
  borderColor    → one of: "extra_purple", "extra_bronze", "extra_silver", "extra_gold".
                   Extra borders are NEVER a "_crumple" value and NEVER a plain
                   colour like "blue" or "red".

══════════════════════════════════════════════════════════
§C — COCA-COLA SPECIAL  (Test 3 default)  →  stickerType = "coca_cola_special"
══════════════════════════════════════════════════════════
Front layout: dynamic action photo (celebrating, mid-play) fills the sticker; player
name printed VERTICALLY (rotated 90°) up the LEFT edge; FIFA logo small in
upper-left; no stats line, no horizontal name bar, no circular flag, no album code.

Note: Coca-Cola stickers themselves carry NO Coca-Cola branding (no script logo, no
hashtag, no wave/ribbon, no Coca-Cola red). The "Coca-Cola" name refers to the
distribution promotion, not on-sticker art. Do not look for branding.

Coca-Cola stickers are single-sided: no back exists.

Extract:
  stickerType    → "coca_cola_special"
  playerName     → the vertical text along the left edge. Read the printed letters
                   you can see; any "(XXX)" country abbreviation embedded in the
                   text is part of the playerName string, not a flag.
  borderColor    → "base_borderless"  (Coca-Cola stickers have no border — they are
                   full-bleed action photos)
  All other fields (albumCode, stickerNumber, teamFifaCode) → null

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
  • Transcribe the printed text exactly as you see it on the sticker
  • UNFAMILIAR NAMES STILL COUNT. Names like "HUSNIDDIN ALIQULOV", "AYMEN ABDENNOUR",
    "HEUNG-MIN SON", "ALPHONSO DAVIES" are all valid printed text. Do not return null
    just because the name looks foreign or hard to pronounce.
  • If a letter is partially obscured but unambiguous from its surrounding visible
    letters (e.g. "VINI?IUS" → "VINICIUS"), commit to that letter — this is
    inference from textual context, not guessing
  • Return null ONLY if the printed text is physically obscured (motion blur, glare,
    plastic sleeve covering letters, foil reflection). Never null because the
    resulting name is unfamiliar to you.
  • Never infer from face, hair, age, kit, or apparent team

borderColor:
  • The border is what you see when you trace the sticker's perimeter with your eye —
    a colour that runs continuously around ALL FOUR edges
  • If the coloured region does NOT touch all four edges, it is NOT the border
  • The name bar (rounded rectangle inside the photo area), photo background, and the
    surface the sticker rests on are NEVER the border, regardless of their colour
  • Tie-breaker: if the name bar colour differs from a thin outer stripe, the outer
    stripe is the border. If there is no outer stripe at all, borderColor is null
    (base/borderless), regardless of what colour the name bar is

confidence:
  • Return any number in [0, 1]; not displayed. Focus effort on the other fields.
$prompt$
WHERE key = 'fifa_world_cup_2026';
