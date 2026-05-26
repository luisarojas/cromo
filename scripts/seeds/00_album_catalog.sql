-- scripts/seeds/00_album_catalog.sql
-- Album catalog: type definitions, editions, formats, and the AI scan prompt.
-- Loaded before any other seeds because every sticker row FKs back to
-- album_types via album_type_id.

INSERT INTO album_types (key, name, guide_path, scan_prompt) VALUES (
  'fifa_world_cup_2026',
  'FIFA World Cup 2026™ Official Sticker Collection',
  '/guide/wc-2026',
  $prompt$Use these rules to classify each FIFA World Cup 2026 Panini sticker visible in the image.

The fields you must fill on each sticker are defined by the outer OUTPUT FORMAT block — these rules tell you HOW to fill `stickerType`, `variantToken`, `playerName`, and `albumCode`. Leave any field you cannot directly observe as null; the backend will resolve missing fields from the album code where possible.

══════════════════════════════════════════════════════════
MULTI-STICKER IMAGES
══════════════════════════════════════════════════════════
A single image may contain ONE or MANY stickers (e.g. a row of stickers on a desk, a sticker sheet, or a small collection). Treat each sticker as an INDEPENDENT object and emit one entry in the output `stickers` array per sticker.

For every sticker in the image, run Steps 1–4 below from scratch. Decisions for one sticker do NOT carry over to another:
  • One sticker may be face-up (FRONT) while another is face-down (BACK) — decide per sticker.
  • Two stickers may have different `stickerType` values, different `variantToken` values, and different `playerName` values — never copy from a neighbour.
  • Ignore stickers that are heavily cropped, severely out of focus, or obscured by another object such that you cannot apply Steps 1–4 to them.
  • Do NOT merge two stickers into one entry, and do NOT split one sticker into multiple entries.

══════════════════════════════════════════════════════════
STEP 1 — FRONT OR BACK OF STICKER? (per sticker)
══════════════════════════════════════════════════════════
The BACK of a sticker is a plain, unglossy paper surface that prints only the album code (e.g. "ARG7", "BRA19", "FWC4", "EX12", "CC4"). No glossy photo, no FIFA logo, no player.

If the sticker is showing its BACK:
  → Set `albumCode` to the printed code exactly as shown (preserve the prefix — "EX12" not "12", "CC4" not "4").
  → Leave `stickerType`, `variantToken`, `playerName`, `stickerNumber`, and `teamFifaCode` as null. The backend resolves them from the album code.
  → Skip Steps 2–4 for this sticker and move on to the next.

If the sticker is showing its FRONT:
  → Leave `albumCode` null (the code is not printed on the front).
  → Continue to Step 2 for this sticker.

══════════════════════════════════════════════════════════
STEP 2 — IDENTIFY STICKER TYPE
══════════════════════════════════════════════════════════
There are exactly THREE sticker types. Use this table — the discriminators are precise and mutually exclusive.

                          │ CORE                       │ EXTRA                          │ COCA-COLA
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Photo                    │ POSED STUDIO PORTRAIT      │ LIVE-ACTION MATCH PHOTO        │ LIVE-ACTION MATCH PHOTO
                          │ player stationary,         │ player mid-play, looking       │ player mid-play, looking
                          │ chest-up, facing camera    │ at ball/field, NOT camera      │ at ball/field, NOT camera
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 FIFA 2026 logo position  │ UPPER-RIGHT corner         │ UPPER-LEFT corner              │ UPPER-LEFT corner
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 "Extra Sticker" text     │ absent                     │ PRESENT (upper-right)          │ absent
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Player-name layout       │ HORIZONTAL name bar        │ HORIZONTAL name bar            │ VERTICAL text running UP the
                          │ lower-center; below it     │ lower-center on BLACK          │ LEFT edge (rotated 90°).
                          │ shows D.O.B., height,      │ background; no stats line      │ No stats line; no horizontal
                          │ weight, club               │                                │ name bar.
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Country flag             │ LOWER-RIGHT, with 3-       │ LOWER-LEFT corner, AND also    │ NONE
                          │ letter country code        │ appears large behind player    │
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 stickerType              │ null                       │ "extra"                        │ "coca_cola_special"

Quick decision (use the strongest two signals):
  • Posed portrait + FIFA logo upper-RIGHT                                 ⇒ CORE
  • Action photo + FIFA logo upper-LEFT + "Extra Sticker" text             ⇒ EXTRA
  • Action photo + FIFA logo upper-LEFT + vertical name on LEFT edge       ⇒ COCA-COLA

CRITICAL: a posed portrait is ALWAYS Core, no matter how shiny, gold, foil, or metallic the backdrop looks. A portrait can NEVER be an Extra.

══════════════════════════════════════════════════════════
STEP 3 — DETERMINE variantToken
══════════════════════════════════════════════════════════

▶ COCA-COLA (stickerType = "coca_cola_special")
    variantToken is ALWAYS "base_borderless". Coca-Cola stickers have no parallels.

▶ EXTRA (stickerType = "extra")
    Every Extra has a WHITE outer rim. Rarity is encoded in the BACKGROUND
    COLOR behind the action photo (NEVER in the rim).
    Map the background:
      Purple / burgundy           → "extra_purple"   (most common)
      Bronze / copper             → "extra_bronze"
      Silver metallic             → "extra_silver"
      Smooth gold gradient        → "extra_gold"     (rarest — smooth, never wrinkled)

▶ CORE (stickerType = null)
    Core stickers come in two finishes: BORDERED or CRUMPLE.

    Finish A — BORDERED. The photo backdrop behind the player is a smooth
    pale-cyan gradient (the standard Panini portrait backdrop — this is
    NOT itself a border). A solid-color rim runs along the cut edge.
    Mentally trace the OUTERMOST 3mm strip at the physical cut edge and
    map its color:

      No outer strip (photo meets the cut edge)         → "base_borderless"   (International Base)
      White 3mm strip                                   → "base_border"       (North American Base)
      Dark navy / denim / ocean blue                    → "blue"
      Fire-engine / crimson red                         → "red"
      Violet / grape / eggplant purple                  → "purple"
      Vivid emerald / grass green                       → "green"
      Pale mint / sage / light-jade green               → "swiss_green"       (Switzerland)
      Saturated orange                                  → "orange_amazon"     (Amazon exclusive)
      Pure black                                        → "black"        (1-of-1)

    Finish B — CRUMPLE. The photo backdrop behind the player is a
    WRINKLED / CREASED metallic foil with visible crinkle and fold lines
    (like crumpled aluminum foil). The player remains a posed studio
    portrait in front of this foil. Map the foil color:

      Gold foil   → "gold_crumple"           (iCollect online base)
      Blue foil   → "blue_crumple"
      Red foil    → "red_crumple"
      Purple foil → "purple_crumple"
      Green foil  → "green_crumple"
      Black foil  → "black_crumple"     (1-of-1)

    GOLD RULE for Core: there is NO smooth gold border in the main set.
    Any gold finish on a Core (portrait) sticker is "gold_crumple". A
    smooth gold gradient appears ONLY on action photos, and those are
    Extras → "extra_gold".

══════════════════════════════════════════════════════════
STEP 4 — EXTRACT playerName
══════════════════════════════════════════════════════════
Read from:
  Core      → horizontal name bar in the lower-center
  Extra     → horizontal name bar (black background) lower-center
  Coca-Cola → vertical text running up the LEFT edge

Transcription rules:
  • Return ALL CAPS exactly as printed.
  • Preserve accents and special characters ("MBAPPÉ", "Ø. SØRLOTH", "VINÍCIUS JR.").
  • Any printed form is valid: surname only ("HAALAND"), initial + surname
    ("L. MESSI"), or full name ("HARRY KANE"). Transcribe what you see.
  • Unfamiliar names are still valid — never return null because the name
    looks unusual. A partial transcription beats null.
  • Return null ONLY when the text is completely illegible (extreme glare,
    severe blur, full occlusion). A faint but readable name is NOT null.

══════════════════════════════════════════════════════════
COMMON MISTAKES — DO NOT MAKE THESE
══════════════════════════════════════════════════════════
1. The pale-cyan gradient backdrop behind every Core portrait is NOT a
   "blue" border. To return "blue", you must see a SEPARATE darker blue
   band at the cut edge, contrasting against the pale cyan inside.
2. The colored name bar inside the sticker is NOT the rim. The rim is the
   outermost 3mm strip at the physical cut edge. A red name bar inside a
   purple rim → variantToken = "purple". A red name bar inside no rim →
   "base_borderless".
3. Wrinkled / creased foil texture is ALWAYS a Core crumple variant,
   NEVER an Extra. Extras have smooth backgrounds.
4. A posed portrait with a gold backdrop is "gold_crumple", never
   "extra_gold". "extra_gold" only applies to action photos.
5. Coca-Cola and International Core base SHARE variantToken
   "base_borderless". Distinguish them by stickerType, decided in Step 2
   (portrait + horizontal name+stats ⇒ Core; action + vertical left-edge
   name ⇒ Coca-Cola).
6. When unsure between two adjacent border colors (blue vs purple, red vs
   purple), prefer the more common one unless the rarer color is clearly
   visible. A false rare is worse than a false base.
7. The surface the sticker is sitting on (tabletop, mat, sleeve, fingers)
   is OUTSIDE the cut edge and is never the rim.$prompt$
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  guide_path  = EXCLUDED.guide_path,
  scan_prompt = EXCLUDED.scan_prompt;

INSERT INTO album_editions (album_type_id, key, name)
SELECT t.id, e.key, e.name
FROM album_types t
CROSS JOIN (VALUES
  ('north_america', 'North American'),
  ('international', 'International'),
  ('swiss_gold',    'Swiss Gold'),
  ('south_america', 'South American')
) AS e(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO album_formats (album_type_id, key, name)
SELECT t.id, f.key, f.name
FROM album_types t
CROSS JOIN (VALUES
  ('softcover_standard',   'Softcover'),
  ('hardcover',            'Hardcover'),
  ('limited_hardcover',    'Limited Hardcover (Treasure Box)'),
  ('silver_hardcover',     'Silver Hardcover'),
  ('gold_hardcover',       'Gold Hardcover'),
  ('metallised_softcover', 'Metallised Softcover')
) AS f(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO album_edition_formats (album_type_id, album_edition_id, album_format_id)
SELECT at.id, ae.id, af.id
FROM album_editions ae
JOIN album_types   at ON at.id = ae.album_type_id
JOIN album_formats af ON af.album_type_id = at.id
WHERE at.key = 'fifa_world_cup_2026'
  AND (
    af.key IN ('softcover_standard', 'hardcover')
    OR (af.key IN ('metallised_softcover', 'limited_hardcover') AND ae.key = 'swiss_gold')
    OR (af.key IN ('silver_hardcover', 'gold_hardcover')        AND ae.key = 'international')
  )
ON CONFLICT (album_edition_id, album_format_id) DO NOTHING;
