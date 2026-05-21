-- Migration 0033: full rewrite of the FIFA WC 2026 scan prompt.
-- Structured around the single most reliable visual signal — the FIFA 2026
-- logo position — which is a clean binary classifier for core vs special
-- stickers. All other type heuristics are subordinated to that signal.

UPDATE album_types SET scan_prompt = $prompt$
ALBUM-SPECIFIC RULES FOR FIFA WORLD CUP 2026 (PANINI):

══════════════════════════════════════════════════════════
OVERRIDING RULES — APPLY BEFORE EVERY DECISION
══════════════════════════════════════════════════════════

1. EXTRA REQUIRES LITERAL TEXT. A sticker is Extra ONLY if you can literally read the
   printed text "Extra Sticker" or "Panini Extra" on the front, OR the back's album
   code starts with "EX". Gold, foil, shine, crumple, holographic, or metallic finish
   is NEVER on its own evidence of an Extra. Crumple ⇒ core. No exceptions.
2. CORE REQUIRES A STATS LINE. A sticker is Core ONLY if it has a visible stats line
   under the name (D.O.B., height, weight, club) AND a circular country flag. No stats
   line and no flag ⇒ NOT core.
3. BORDER IS THE PERIMETER. The border is the colour you can trace continuously around
   ALL FOUR edges of the sticker. If a coloured region does not touch all four edges,
   it is NOT the border. The name bar is a rounded rectangle INSIDE the photo area and
   is NEVER the border, regardless of its colour.
4. NAME IS PRINTED TEXT ONLY. Transcribe the printed name as you see it; never infer
   from face, hair, kit, or team. If a letter is partially obscured but unambiguous
   from its surrounding visible letters, commit to it. Return null only when too much
   of the text is unreadable to form a recognizable name.
5. KIT ≠ FLAG. A national team kit is not a country flag. Do not infer teamFifaCode
   from kit colour.

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

Two sub-types share the upper-left logo: Extra and Coca-Cola. They are mutually
exclusive. Apply the COCA-COLA ABSENCE CHECK first because it is the most reliable
discriminator — it tests for the absence of core/extra features, which is easier
than reading small text or finishes.

COCA-COLA ABSENCE CHECK (run FIRST, on every logo-upper-left sticker)
  A sticker is Coca-Cola (stickerType = "coca_cola_special") if ALL FOUR of these
  features are ABSENT from the front:
    ✗ stats line (no D.O.B., no height, no weight, no club)
    ✗ country flag (no circular flag anywhere on the sticker)
    ✗ horizontal name bar (no rounded rectangle holding a horizontal name)
    ✗ posed studio portrait (the photo is a dynamic action shot instead)
  If all four are absent → Coca-Cola. Go to §B.2. Stop.
  Supporting confirmation (not required): player name printed VERTICALLY (rotated 90°)
  up the LEFT edge; single-sided (no back exists); recognisable international star
  (Lamine Yamal, Alphonso Davies, Harry Kane, Weston McKennie, etc.).
  Note: Coca-Cola stickers carry NO Coca-Cola branding (no script logo, no hashtag,
  no wave/ribbon, no Coca-Cola red). Do not look for any of those.

EXTRA CHECK (run only if the Coca-Cola Absence Check fails)
  A sticker is Extra (stickerType = "extra") ONLY if at least ONE of these is true:
    • You can literally read "Extra Sticker" or "Panini Extra" as printed text on
      the front
    • The back's album code starts with "EX" (e.g. "EX5")
    • The border is a holographic foil in Extra-only colours (the border belongs to
      this exclusive set: Purple, Bronze, Silver, Gold — never any other colour)
  If none of those is true, the sticker is NOT Extra. Go back and re-check whether
  the Coca-Cola Absence Check passes; if it still doesn't, treat as Core (re-read the
  logo position — a logo that looked upper-left on a foil/shiny sticker may actually
  be upper-right).
  Supporting (not decisive on their own): live-action match photo with blurred
  stadium; country flag in the LOWER-LEFT corner.
  Hard negative: a posed stationary studio portrait is never Extra. Foil/shine/gold
  finish alone is never Extra.

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
  playerName     → the vertical text along the left edge (transcribe what you see;
                   commit to obscured letters when unambiguous from neighbours;
                   null only if too much is unreadable to form a name)
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
  • Transcribe the printed text exactly as you see it on the sticker
  • If a letter is partially obscured but unambiguous from its surrounding visible
    letters (e.g. "VINI?IUS" → "VINICIUS"), commit to that letter — this is
    inference from textual context, not guessing
  • If a letter is truly ambiguous between multiple candidates, or too much of the
    text is unreadable to form a recognizable name → null
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
