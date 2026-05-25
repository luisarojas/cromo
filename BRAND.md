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

### Surface (the dark canvas)
| Token | Hex | Use |
| --- | --- | --- |
| `--cromo-bg` | `#0A0B0F` | App body, the deepest layer |
| `--cromo-surface` | `#14161D` | Cards, modals, navbar |
| `--cromo-surface-2` | `#1C1F28` | Hover, secondary panels |
| `--cromo-border` | `#2A2E3A` | Hairlines, dividers |
| `--cromo-border-strong` | `#3A3F4D` | Stronger borders, input outlines |

### Foreground (text on dark)
| Token | Hex | Use |
| --- | --- | --- |
| `--cromo-fg` | `#F5F6FA` | Primary text |
| `--cromo-fg-muted` | `#9CA3B8` | Secondary text, labels |
| `--cromo-fg-subtle` | `#5C6378` | Tertiary text, placeholders |

### Accent — "cromo cyan"
| Token | Hex | Use |
| --- | --- | --- |
| `--cromo-accent` | `#6EE7F9` | Primary brand color, links, focus rings |
| `--cromo-accent-strong` | `#22D3EE` | Active states, primary buttons |
| `--cromo-accent-soft` | `rgba(110, 231, 249, 0.12)` | Subtle backgrounds, accent fills |

### Rarity tier colors (semantic — bind to variant rarity tiers from CLAUDE.md §Sticker Types)
| Token | Hex | Tier |
| --- | --- | --- |
| `--cromo-tier-common` | `#94A3B8` | Common (base) |
| `--cromo-tier-uncommon` | `#60A5FA` | Uncommon (blue, 1 in 2) |
| `--cromo-tier-rare` | `#F87171` | Rare (red, 1 in 25) |
| `--cromo-tier-very-rare` | `#A78BFA` | Very Rare (purple, 1 in 200) |
| `--cromo-tier-ultra-rare` | `#34D399` | Ultra Rare (green, 1 in 1,400) |
| `--cromo-tier-masterpiece` | _chrome gradient_ | 1-of-1 (black/black-crumple) |

### Status
| Token | Hex |
| --- | --- |
| `--cromo-success` | `#34D399` |
| `--cromo-warning` | `#FBBF24` |
| `--cromo-danger` | `#F87171` |
| `--cromo-info` | `#6EE7F9` |

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
A rounded square — the sticker — with a thick lowercase **c** carved into the negative space. The square fills with the chrome gradient on the marketing surface, with `--cromo-accent` on dense UI surfaces, and with currentColor on monochrome contexts (favicons, email).

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

- **Surfaces stack.** `bg` → `surface` → `surface-2`. Borders are hairlines (`1px`, `--cromo-border`), never shadows. Avoid drop shadows on dark mode entirely.
- **Radii.** `4px` for chips and inputs, `8px` for buttons, `12px` for cards, `20px` for modals. The mark uses `5/24 viewBox units` (~21%) so it reads as "a sticker," not "a generic app icon."
- **Buttons.** Primary = solid `--cromo-accent` on `--cromo-bg` text. Secondary = `--cromo-surface-2` with `--cromo-fg`. Ghost = transparent with `--cromo-fg-muted` until hover.
- **Focus.** 2px ring in `--cromo-accent` at 60% opacity, offset 2px.
- **Motion.** Default 120ms ease-out. Foil/holographic shimmer animation is 4s, infinite, only on chrome-filled elements.

## 8. Scope of the Identity

What the brand explicitly covers today:
- Logo (mark, wordmark, lockup) and favicon
- Color tokens, typography, motion baseline
- Marketing surfaces: landing, login, NavBar
- Email branding (subjects, sender voice)

Out of scope for this pass — these surfaces still work but inherit the old visual treatment and should be revisited in follow-up work:
- Internal product surfaces (dashboard, album grid, trade, profile, scan, admin) — kept on existing light theme so functionality is unaffected; brand tokens are wired so future re-skins can pull from a single source of truth.
- Mobile/PWA splash screens
- OpenGraph / social share cards
- Print and physical merchandise (pack stickers, business cards)
