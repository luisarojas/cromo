# Cromo — Brand Guide

> _**Cromo** (n., Spanish) — a trading sticker or collector's card. From Greek **chroma**, "color."_

Cromo is a collection-tracking and trading platform for serious hobbyists. It begins with FIFA Panini stickers and extends to every collectible format that comes after — cards, miniatures, plush, vinyl, comics. The brand has to feel premium enough that an adult is proud to use it, and warm enough that a kid still recognizes the magic of peeling open a fresh pack.

The visual identity is **modern-premium holofoil**: dark-mode-first surfaces, deliberate restraint, and one signature material — an iridescent "chrome" gradient — used the way a foil parallel is used in the album itself: sparingly, as a reward.

---

## 1. Name

- **Cromo** — KROH-moh. Two syllables, pure vowels, identical in English and Spanish.
- Always lowercase in the wordmark (`cromo`). Title-cased ("Cromo") in body copy when starting a sentence.
- Never abbreviate to "CRM" (collides with sales-CRM). Never pluralize the product name.

## 2. Tagline

Primary: **"Every variant. Every trade."**
Alt (Spanish-leaning): **"Tu colección, en chrome."**

Use the primary on English-default surfaces. The alt is for Spanish-language marketing only — do not mix them in the same surface.

## 3. Voice

- **Collector-literate, never childish.** Say "variant," "parallel," "1-of-1," "chase." Don't say "fun stickers!" or "gotta catch 'em all."
- **Confident and short.** UI copy in 1–6 words where possible. Marketing copy in sentences, not paragraphs.
- **Bilingual-aware.** Default English. When Spanish appears (Coca-Cola, Latin-American regional editions), use it correctly — accents intact, no English calques.
- **Specific over generic.** "1 in 1,400 packs" beats "very rare." Numbers carry credibility.

## 4. Color System

### Surface
Same conceptual stack in both themes — `bg` (deepest) → `surface` (cards/modals/navbar) → `surface-2` (hover, secondary panels). The light palette deliberately widens the `bg → surface` luminance gap so cards have a visible elevation against the canvas, not just a hairline border.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--cromo-bg` | `#0A0B0F` | `#F1F3F7` | App body, the deepest layer |
| `--cromo-surface` | `#14161D` | `#FFFFFF` | Cards, modals, navbar, footer |
| `--cromo-surface-2` | `#1C1F28` | `#E7EAF1` | Hover, secondary panels, skeleton fills |
| `--cromo-border` | `#2F3446` | `#D2D7E0` | Hairlines, card boundaries (clears WCAG 1.4.11 non-text 3:1 in both themes) |
| `--cromo-border-strong` | `#3F4459` | `#ADB4C2` | Stronger borders, input outlines |

### Foreground (text)
| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--cromo-fg` | `#F5F6FA` (17.9 : 1 — AAA) | `#15192B` (15.8 : 1 — AAA) | Primary text |
| `--cromo-fg-muted` | `#9CA3B8` (7.3 : 1 — AAA) | `#475569` (7.0 : 1 — AAA) | Secondary text, labels |
| `--cromo-fg-subtle` | `#6B7388` (4.6 : 1 — AA)  | `#64748B` (4.6 : 1 — AA)  | Tertiary text, placeholders |

### Accent — "cromo cyan"
| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--cromo-accent` | `#6EE7F9` | `#0E7490` | **Text-safe** accent — links, accent text, hover. Always passes AA on `--cromo-bg`. |
| `--cromo-accent-vivid` | `#22D3EE` | `#06B6D4` | **Brand-vibe** accent — fill, icons, dots, focus rings. Vibrant in both themes; no contrast guarantee for text. |
| `--cromo-accent-strong` | `#22D3EE` | `#155E75` | Active states, pressed buttons |
| `--cromo-accent-soft` | `rgba(110, 231, 249, 0.12)` | `rgba(6, 182, 212, 0.14)` | Subtle accent surfaces |
| `--cromo-accent-fg` | `#0A0B0F` | `#FFFFFF` | Text that sits **on top of** `--cromo-accent` |

**Why two accent tokens?** Light-mode cyan can't be both vibrant AND AA-readable as text — a #06B6D4 link on white fails contrast. Decoupling fixes the trade-off: `-vivid` carries the brand wherever contrast doesn't apply (a dot, an icon background, a focus ring), `--cromo-accent` is reserved for text and always passes AA. In dark mode the two values are nearly identical (the bright dark-mode accent already passes AAA) so the split is meaningful only on the light canvas.

### Rarity tier colors (semantic — bind to variant rarity tiers from CLAUDE.md §Sticker Types)
| Token | Hex | Tier |
| --- | --- | --- |
| `--cromo-tier-common` | `#94A3B8` | Common (base) |
| `--cromo-tier-uncommon` | `#60A5FA` | Uncommon (blue, 1 in 2) |
| `--cromo-tier-rare` | `#F87171` | Rare (red, 1 in 25) |
| `--cromo-tier-very-rare` | `#A78BFA` | Very Rare (purple, 1 in 200) |
| `--cromo-tier-ultra-rare` | `#34D399` | Ultra Rare (green, 1 in 1,400) |
| `--cromo-tier-masterpiece` | _chrome gradient_ | 1-of-1 (black/black-crumple) |

### Status (same decoupled-token model as accent)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--cromo-success` | `#34D399` | `#10B981` | **Vivid fill** — toasts, status pills, badge background |
| `--cromo-success-text` | `#34D399` | `#047857` | **Text-safe** — text on `--cromo-bg` or `*-soft` |
| `--cromo-success-soft` | rgba(52,211,153,0.12) | rgba(16,185,129,0.12) | Subtle status background |
| `--cromo-success-fg` | `#0A0B0F` | `#FFFFFF` | Text that sits **on top of** `--cromo-success` |
| `--cromo-warning` / `-text` / `-soft` / `-fg` | mint family | amber family | Same pattern, attention/caution |
| `--cromo-danger`  / `-text` / `-soft` / `-fg` | coral family | red family   | Same pattern, errors/destructive |
| `--cromo-info` | `#6EE7F9` | `#06B6D4` | Informational notices |

Same reason as accent: light-mode status colors need to be vibrant for **fills** (a bright emerald toast feels like Cromo) but **dark** for **text** (forest green passes AA on white, mint does not). The pattern is consistent: `--cromo-X` is the fill, `--cromo-X-text` is the readable text color, `--cromo-X-soft` is the tinted background, `--cromo-X-fg` is the high-contrast foreground that sits on top of the saturated fill.

### Chrome — the signature material
The iridescent gradient is what makes Cromo _feel_ like Cromo. Use it for:
- The logo mark on dark surfaces
- Masterpiece (1-of-1) rarity treatments
- Primary CTAs on the marketing landing only — never on every internal button
- Hero text accents on the landing page

```css
--cromo-chrome: conic-gradient(
  from 180deg at 50% 50%,
  #22D3EE 0deg,
  #A78BFA 90deg,
  #FBBF24 180deg,
  #F472B6 270deg,
  #22D3EE 360deg
);
```

**Rule:** Chrome is a reward, not a wallpaper. If you used it on the last surface, don't use it on this one.

**Static, always.** Chrome surfaces never animate. The `.cromo-shimmer` class is reserved as a no-op for future opt-in motion; animated backgrounds compete with reading and are disallowed on every text-bearing surface.

**Never decorative.** Chrome belongs on _something_: the logo mark, the masterpiece tier swatch, a hero CTA, a 100%-completion celebration. It does not belong on neutral page chrome — no rules, dividers, or accent stripes purely as ornament. If chrome shows up on a page, it should be marking something meaningful.

## 5. Typography

| Role | Family | Source |
| --- | --- | --- |
| Display / Brand | **Space Grotesk** (500, 700) | Google Fonts |
| Body / UI | **Inter** (400, 500, 600) | Google Fonts |
| Monospace (codes like `COL4`) | **JetBrains Mono** (400, 600) | Google Fonts |

- Wordmark and major headings → Space Grotesk, slight negative tracking (`-0.02em`).
- All body, button, label text → Inter.
- Album codes, IDs, technical strings → JetBrains Mono.

Load via `next/font/google` so the fonts self-host and there is no FOIT.

## 6. Logo

### Mark
A rounded square — the sticker — with a thick lowercase **c** carved into the negative space. The square fills with the chrome gradient on the marketing surface, with `--cromo-accent` on dense UI surfaces, and with currentColor on monochrome contexts (favicons, email). **The carved "c" is always white (`#FFFFFF`), in every variant** — that's the consistent brand glyph; only the surface behind it changes.

The mark scales from 16px (favicon) to 200px (landing hero) without losing readability. Below 16px, prefer the solid-accent variant — chrome will alias.

### Wordmark
`cromo` set in Space Grotesk Bold, lowercase, `-0.04em` tracking. The dot of color above-and-right of the wordmark is optional — use it only when the mark is _not_ also present in the lockup.

### Lockup
Horizontal: mark + 8px gap + wordmark. The mark sits at the wordmark's cap height. Do not stack vertically unless the surface is narrower than 80px.

### Clear space
Minimum clear space around the lockup equals the height of the mark. No exceptions.

### Don'ts
- Don't recolor the mark to anything except `--cromo-accent`, white, black, or chrome.
- Don't stretch, skew, or rotate.
- Don't add drop shadows or outer glows. The chrome gradient is the only ornamental treatment allowed.

## 7. Component Principles

- **Surfaces stack.** `bg` → `surface` → `surface-2`. Borders are hairlines (`1px`, `--cromo-border`), and on dark mode they replace traditional drop shadows almost entirely. Where elevation is needed (modals, popovers, fixed bars), prefer the theme-aware `.shadow-cromo-{sm,md,lg}` utilities over Tailwind's `shadow-*` — dark-mode shadows are composed of a 1px inner highlight + ambient drop so depth reads without the harsh black blob that standard shadows leave on dark.
- **Radii.** `4px` for chips and inputs, `8px` for buttons, `12px` for cards, `20px` for modals. The mark uses `5/24 viewBox units` (~21%) so it reads as "a sticker," not "a generic app icon."
- **Buttons.** Primary = solid `--cromo-accent` on `--cromo-accent-fg` text. Secondary = `--cromo-surface-2` with `--cromo-fg`. Ghost = transparent with `--cromo-fg-muted` until hover. Danger = solid `--cromo-danger` on `--cromo-danger-fg`. Chrome = gradient on `#0A0B0F` text — reserve for marketing CTAs.
- **Focus.** 2px ring in `--cromo-accent`, offset 2px from `--cromo-bg`. Native browser `:focus-visible` only — no permanent rings on click.
- **Motion.** Default `120ms ease-out` for hover/active transitions. **Backgrounds never animate** — chrome surfaces are static, no shimmer. Skeleton loaders (`animate-pulse`) and toast entry animations are the exceptions, both because they're transient state-change signals, not ambient decoration.

### Site chrome (layout shell)

Every page is wrapped by three persistent layers from the root layout:

1. **NavBar** — top of every page. Holds the lockup (chrome mark + wordmark), primary nav, dev-only cache-clear chip, the compact theme toggle, and the user menu.
2. **`<main>`** — flex-1 so it always fills available height and pushes the footer down.
3. **Footer** — quiet, four-column block on the `--cromo-surface` background. Brand lockup + tagline + nav columns (Product / Resources / Account) + copyright. Includes the legally-required disclaimer that Cromo is unaffiliated with Panini or FIFA.

## 8. Accessibility Floors

These are the contrast minimums Cromo commits to. The palette above is tuned so default token pairings already pass; if you compose a new pair, verify against this floor before shipping.

| Pairing | Floor | Where it applies |
| --- | --- | --- |
| Body & UI text on its surface | 4.5 : 1 (WCAG AA) | All `--cromo-fg-*` on `--cromo-bg`, `--cromo-surface`, `--cromo-surface-2` |
| Large text (≥ 18pt or 14pt bold) | 3 : 1 (WCAG AA-large) | Display headings, hero titles |
| Non-text UI (borders, focus rings, icons) | 3 : 1 (WCAG 1.4.11) | Card borders, input outlines, focus indicators |
| Status text on saturated fill | 4.5 : 1 | Use the matching `--cromo-{status}-fg` token — never plain `text-white` |

The current dark palette is conservative — primary text clears AAA and the dimmest tertiary `--cromo-fg-subtle` lands at 4.6 : 1 AA. Light mode darkens success / warning / danger compared to their dark-mode counterparts specifically so they clear AA on the lighter canvas.

## 9. Scope of the Identity

What the brand explicitly covers today:
- Logo (mark, wordmark, lockup), favicon, apple-touch icon
- Color tokens, typography, motion baseline, accessibility floors
- Persistent layout chrome: NavBar + Footer wrap every page
- Email branding (subjects, sender voice)

Out of scope for this pass — these surfaces still work but inherit the old visual treatment and should be revisited in follow-up work:
- Internal product surfaces (dashboard, album grid, trade, profile, scan, admin) — kept on existing light theme so functionality is unaffected; brand tokens are wired so future re-skins can pull from a single source of truth.
- Mobile/PWA splash screens
- OpenGraph / social share cards
- Print and physical merchandise (pack stickers, business cards)
