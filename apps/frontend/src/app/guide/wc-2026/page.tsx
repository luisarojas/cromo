import Link from 'next/link';

export default function WC2026GuidePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

      {/* Back */}
      <Link
        href="/guide"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
      >
        <span aria-hidden>←</span> All guides
      </Link>

      {/* Hero */}
      <div className="rounded-2xl cromo-chrome-fill cromo-shimmer px-8 py-10 text-[#0A0B0F] relative overflow-hidden">
        <span className="inline-flex items-center rounded-full bg-black/15 backdrop-blur px-3 py-1 text-[11px] font-semibold uppercase tracking-wider mb-4">
          2026 FIFA World Cup
        </span>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">Panini Sticker Collection</h1>
        <p className="text-black/70 text-lg font-medium mt-0.5">Album Guide</p>
        <p className="mt-3 text-black/80 text-sm max-w-lg leading-relaxed">
          A complete reference for collectors — covering regional editions, album formats, sticker
          variants and parallels, the full 980-slot breakdown, and where to find everything.
        </p>
      </div>

      {/* TOC */}
      <nav className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--cromo-fg-subtle)] mb-3">
          In this guide
        </p>
        <ol className="grid sm:grid-cols-2 gap-0.5">
          {(
            [
              ['#editions', 'Regional Editions'],
              ['#formats', 'Album Formats'],
              ['#variants', 'Sticker Variants & Parallels'],
              ['#breakdown', "What's in the Album (980 stickers)"],
              ['#coca-cola', 'Coca-Cola Special Section'],
              ['#where-to-buy', 'Where to Buy'],
            ] as const
          ).map(([href, label], i) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-accent)] transition-colors group"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent-soft)] text-[10px] font-bold text-[var(--cromo-accent)] group-hover:bg-[var(--cromo-accent-soft)] transition-colors">
                  {i + 1}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1. Regional Editions */}
      <section
        id="editions"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            1
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Regional Editions</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          Panini publishes distinct regional variants of the same base album, each with a different
          cover, language, and sometimes unique extras. The 980-sticker slot list is identical across
          all editions — what changes is packaging, regional cover art, and which parallels or
          exclusives you can pull. Knowing your edition matters if you&apos;re hunting specific
          parallels.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)] whitespace-nowrap">
                  Region
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Edition Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Key Traits
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  USA / Canada
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">North America (NA)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  White-bordered stickers; six border parallels (Blue, Red, Purple, Green, Black,
                  Orange)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Mexico</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Mexico Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Spanish-language; dedicated Mexican cover variant
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  International
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Global (Standard)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  No white border on stickers; 20 bonus elite-player stickers in
                  Purple / Bronze / Silver / Gold (no album slot — collectibles only)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">UK</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">UK Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">UK-specific Coca-Cola sticker lineup</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  Latin America
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">LATAM Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  LATAM-specific Coca-Cola sticker lineup
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  Switzerland
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">United Edition (United 2026)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Thicker paper; metallised softcover; exclusive Green parallel stickers; numbered
                  Treasure Box hardcover (1–5000)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Belgium</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Belgium Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Silver parallel (players only) exclusive to Special Blister packs
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Serbia</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Serbia Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Unique Coca-Cola sticker subset</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">
                  Brazil, France, Germany, Spain, Italy, Colombia, and more
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Country-specific covers</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Same base content; regional cover art; France also has Silver and Gold premium
                  hardcover editions
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--cromo-fg-subtle)] leading-relaxed">
          Team page order within the album varies by edition — host nations (Canada, Mexico, USA)
          appear prominently early in the North American edition, while LATAM editions foreground
          Brazil and Argentina.
        </p>
      </section>

      {/* 2. Album Formats */}
      <section
        id="formats"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            2
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Album Formats</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          Multiple physical formats exist across different markets. All contain the same 980 sticker
          slots — the differences are cover material, binding style, and how widely available they
          are.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Format
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Availability
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Approx. Price
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Softcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Global — supermarkets, newsstands, most retailers
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">~$4.99 / £4.99 / €5 / CHF 4.90</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Global — Amazon Collectors Bundle and select retailers
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">~$14.99 / £12.99</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Metallised Softcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Switzerland only — United Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">CHF 4.90</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">
                  Limited Hardcover (Treasure Box)
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Switzerland only — numbered 1/5000 to 5000/5000
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">CHF premium</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Silver Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">France only — premium tier</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">€ premium</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Gold Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">France only — premium tier</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">€ premium</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-4 py-3">
          <span className="text-[var(--cromo-warning)] shrink-0 mt-0.5 text-base leading-none">⚠</span>
          <p className="text-xs text-amber-800 leading-relaxed">
            There is no &ldquo;Platinum&rdquo; edition for the 2026 collection. Any listing or
            product using that name is unofficial — do not pay a premium for it.
          </p>
        </div>
      </section>

      {/* 3. Sticker Variants */}
      <section
        id="variants"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            3
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Sticker Variants &amp; Parallels</h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Base Finish</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Standard (matte)</span> — non-foil base
              stickers; the majority of the collection
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Foil</span> — shiny finish applied to
              sticker{' '}
              <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">00</code>,
              FWC-1 through FWC-8, and all 48 team emblems (49 foil stickers total)
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">
            North America Border Parallels
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            Found in physical packs sold in the USA and Canada only. Applied to non-foil stickers —
            foil stickers do not receive a color border.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Parallel
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Pull Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-[var(--cromo-accent)]', label: 'Blue Border', rate: '1 in 2 packs' },
                  { color: 'bg-[var(--cromo-danger)]', label: 'Red Border', rate: '1 in 25 packs' },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: 'Purple Border', rate: '1 in 200 packs' },
                  { color: 'bg-[var(--cromo-success)]', label: 'Green Border', rate: '1 in 1,400 packs' },
                  { color: 'bg-gray-900', label: 'Black Border', rate: '1 of 1 — unique' },
                  { color: 'bg-orange-400', label: 'Orange Border', rate: 'Amazon 50-pack box exclusive' },
                ].map(({ color, label, rate }) => (
                  <tr key={label} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                    <td className="px-4 py-3 text-[var(--cromo-fg)]">
                      <span className="flex items-center gap-2.5">
                        <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${color}`} />
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">
            Panini America iCollect &ldquo;Crumple&rdquo; Parallels
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            Available exclusively through the Panini America iCollect digital store. These cannot be
            found in physical packs — they are a separate digital product line.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Parallel
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Pull Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-yellow-400', label: 'Gold Flood Crumple', rate: '6 per iCollect pack' },
                  { color: 'bg-[var(--cromo-accent)]', label: 'Blue Crumple', rate: '1 in 2' },
                  { color: 'bg-[var(--cromo-danger)]', label: 'Red Crumple', rate: '1 in 26' },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: 'Purple Crumple', rate: '1 in 285' },
                  { color: 'bg-[var(--cromo-success)]', label: 'Green Crumple', rate: '1 in 1,529' },
                  { color: 'bg-gray-900', label: 'Black Crumple', rate: '1 of 1 — unique' },
                ].map(({ color, label, rate }) => (
                  <tr key={label} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                    <td className="px-4 py-3 text-[var(--cromo-fg)]">
                      <span className="flex items-center gap-2.5">
                        <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${color}`} />
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Other Regional Parallels</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Green (United Edition)</span> —
              Switzerland exclusive, found in the Panini United 2026 product line
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Silver (players only)</span> — Belgium
              exclusive, found in Special Blister packs
            </li>
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 px-4 py-3">
          <span className="text-[var(--cromo-accent)] shrink-0 mt-0.5 text-base leading-none">ℹ</span>
          <p className="text-xs text-[var(--cromo-accent)] leading-relaxed">
            <span className="font-semibold">International bonus stickers:</span> The international
            format includes 20 elite-player bonus stickers in Purple, Bronze, Silver, and Gold
            variants, pulled roughly 1 in 100 packs. These have{' '}
            <span className="font-semibold">no album slot</span> — they are standalone collectibles
            outside the base 980-sticker set.
          </p>
        </div>
      </section>

      {/* 4. What's in the Album */}
      <section
        id="breakdown"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            4
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">
            What&apos;s in the Album{' '}
            <span className="font-normal text-[var(--cromo-fg-muted)] text-base">(980 stickers)</span>
          </h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          The slot composition is identical across all regional editions. The album runs 112 pages
          and follows this structure:
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Section
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Slots
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Codes
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">We Are Panini</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">1</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">00</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Foil</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">World Cup Branding</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">5</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-1 to FWC-5</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Emblem ×2, Mascot, Slogan, Ball — all Foil
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Host Countries</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">3</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-6 to FWC-8</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Canada, Mexico, USA emblems — all Foil
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">FIFA Museum (Past Champions)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">11</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-9+</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Team photos of past World Cup winners. Some champions (e.g. Italy &apos;38,
                  Brazil &apos;58, England &apos;66) are printed directly in the album — they are
                  not collectible sticker slots.
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">48 Teams</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">48 × 20 = 960</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">
                  e.g. ARG-1 to ARG-20
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Per team: 1 Foil emblem + 18 player stickers + 1 team photo
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Coca-Cola Special</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">12</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">CC1 to CC12</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Double-page spread in the middle of the album. Not in standard packs — see
                  section 5.
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-transparent border-t-2 border-[var(--cromo-border)]">
                <td className="px-4 py-3 font-bold text-[var(--cromo-fg)]">Total</td>
                <td className="px-4 py-3 font-bold text-[var(--cromo-fg)]">980</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 5. Coca-Cola */}
      <section
        id="coca-cola"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            5
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Coca-Cola Special Section</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          Stickers{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC1</code> to{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC12</code> fill a
          double-page spread in the middle of the album. They feature elite players selected in
          partnership with Coca-Cola. The 12 album slots are the same in every edition, but which
          players appear depends on where your packs were sold.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Regional Set
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Distributed In
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Notable Players
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">NAOU</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">USA, Canada</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Antonee Robinson (USA), Alphonso Davies (Canada)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">EUR</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">UK, Germany, France, Spain, Serbia</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  William Saliba (France), Eduardo Camavinga (some variants)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">LATAM</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Latin America</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">LATAM-specific player selection</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">RoW</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Rest of World</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Jordan Ayew (Ghana)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Where to Buy */}
      <section
        id="where-to-buy"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            6
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Where to Buy</h2>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Physical Packs &amp; Albums</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              {
                name: 'Supermarkets & newsstands',
                desc: 'Walmart, Target, Tesco, Carrefour, Rewe, Fnac, and equivalents. Standard softcover album and loose packs (~5 stickers per pack).',
              },
              {
                name: 'Amazon',
                desc: 'Collectors Bundle includes a hardcover album. USA/Canada listings also carry the Orange Border Amazon-exclusive pack boxes.',
              },
              {
                name: 'Panini official stores',
                desc: 'paniniamerica.net, panini.co.uk, panini.de, etc. — starter packs, blister packs, multi-pack bundles, and regional exclusives.',
              },
              {
                name: 'Sports card & hobby shops',
                desc: 'Often stock full boxes and premium bundles; best source for box-break events and hard-to-find variants.',
              },
              {
                name: 'Switzerland — Panini United 2026',
                desc: 'Sold through Swiss Panini distributors and online at panini.ch. The numbered Treasure Box hardcover (1–5000 units) is exclusive to this channel.',
              },
              {
                name: 'France — Silver / Gold Hardcover',
                desc: 'Available at Fnac, Leclerc, and the Panini France online store.',
              },
            ].map(({ name, desc }) => (
              <li key={name} className="flex gap-2">
                <span className="mt-1 text-[var(--cromo-fg-subtle)] shrink-0">›</span>
                <span>
                  <span className="font-medium text-[var(--cromo-fg)]">{name}</span> — {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Online &amp; Digital</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              {
                name: 'Panini America iCollect',
                desc: 'Digital packs with Crumple parallels exclusive to this platform (icollect.paniniamerica.net). No physical delivery.',
              },
              {
                name: 'FIFA Panini Collection app',
                desc: 'Official digital companion app that mirrors the print album layout per region. Useful for checking sticker progress.',
              },
              {
                name: 'eBay / Mercado Libre / Vinted',
                desc: 'Secondary market for singles, sealed packs, and rare parallels. Prices vary significantly — compare listings before buying.',
              },
            ].map(({ name, desc }) => (
              <li key={name} className="flex gap-2">
                <span className="mt-1 text-[var(--cromo-fg-subtle)] shrink-0">›</span>
                <span>
                  <span className="font-medium text-[var(--cromo-fg)]">{name}</span> — {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-transparent border border-[var(--cromo-border)] px-4 py-3">
          <span className="text-[var(--cromo-fg-subtle)] shrink-0 mt-0.5 text-base leading-none">ℹ</span>
          <p className="text-xs text-[var(--cromo-fg-muted)] leading-relaxed">
            Prices and availability are approximate as of May 2026 and vary by retailer and country.
            Page-number references in Panini&apos;s album shift between regional editions — for
            exact placement, consult the table of contents in your specific album or the FIFA Panini
            Collection app.
          </p>
        </div>
      </section>
    </div>
  );
}
