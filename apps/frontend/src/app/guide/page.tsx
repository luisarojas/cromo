export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Album Guide</h1>
        <p className="mt-2 text-sm text-gray-500">
          2026 FIFA World Cup Panini Sticker Collection — editions, formats, variants, and where to
          buy.
        </p>
      </div>

      {/* TOC */}
      <nav className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Contents
        </p>
        <ol className="space-y-1.5 text-sm text-blue-600">
          <li>
            <a href="#editions" className="hover:underline">
              1. Regional Editions
            </a>
          </li>
          <li>
            <a href="#formats" className="hover:underline">
              2. Album Formats
            </a>
          </li>
          <li>
            <a href="#variants" className="hover:underline">
              3. Sticker Variants &amp; Parallels
            </a>
          </li>
          <li>
            <a href="#breakdown" className="hover:underline">
              4. What&apos;s in the Album (980 stickers)
            </a>
          </li>
          <li>
            <a href="#coca-cola" className="hover:underline">
              5. Coca-Cola Special Section
            </a>
          </li>
          <li>
            <a href="#where-to-buy" className="hover:underline">
              6. Where to Buy
            </a>
          </li>
        </ol>
      </nav>

      {/* 1. Regional Editions */}
      <section id="editions" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">1. Regional Editions</h2>
        <p className="text-sm text-gray-600">
          The same 980-sticker base set is sold worldwide, but Panini publishes distinct regional
          album variants with different covers, languages, and occasionally different sticker
          borders or extras. The content inside is the same — what changes is presentation and
          regional exclusives.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200 whitespace-nowrap">Region</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Edition Name</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Key Traits</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">USA / Canada</td>
                <td className="px-3 py-2 border border-gray-200">North America (NA)</td>
                <td className="px-3 py-2 border border-gray-200">White-bordered stickers; border parallels (Blue, Red, Purple, Green, Black, Orange)</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Mexico</td>
                <td className="px-3 py-2 border border-gray-200">Mexico Edition</td>
                <td className="px-3 py-2 border border-gray-200">Spanish-language; dedicated Mexican cover variant</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">International</td>
                <td className="px-3 py-2 border border-gray-200">Global (Standard)</td>
                <td className="px-3 py-2 border border-gray-200">No white border on stickers; 20 extra stickers (elite players, not album slots) in Purple/Bronze/Silver/Gold</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">UK</td>
                <td className="px-3 py-2 border border-gray-200">UK Edition</td>
                <td className="px-3 py-2 border border-gray-200">UK-specific Coca-Cola sticker lineup</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Latin America</td>
                <td className="px-3 py-2 border border-gray-200">LATAM Edition</td>
                <td className="px-3 py-2 border border-gray-200">LATAM-specific Coca-Cola sticker lineup</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Switzerland</td>
                <td className="px-3 py-2 border border-gray-200">United Edition (United 2026)</td>
                <td className="px-3 py-2 border border-gray-200">Thicker paper; metallised softcover; exclusive Green parallel stickers; numbered Treasure Box hardcover (1–5000)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Belgium</td>
                <td className="px-3 py-2 border border-gray-200">Belgium Edition</td>
                <td className="px-3 py-2 border border-gray-200">Silver parallel (players only) exclusive to Special Blister packs</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Serbia</td>
                <td className="px-3 py-2 border border-gray-200">Serbia Edition</td>
                <td className="px-3 py-2 border border-gray-200">Unique Coca-Cola sticker subset</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">Brazil, France, Germany, Spain, Italy, Colombia, etc.</td>
                <td className="px-3 py-2 border border-gray-200">Country-specific covers</td>
                <td className="px-3 py-2 border border-gray-200">Same base content; regional cover art; France has Silver and Gold hardcover premium editions</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">
          Team page order within the album varies by edition — host nations (Canada, Mexico, USA)
          appear prominently early in the North American edition, while LATAM editions foreground
          Brazil and Argentina.
        </p>
      </section>

      {/* 2. Album Formats */}
      <section id="formats" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">2. Album Formats</h2>
        <p className="text-sm text-gray-600">
          Multiple physical formats exist. All contain the same 980 sticker slots — the difference
          is cover material, binding, and exclusivity.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Format</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Availability</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Approx. Price</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Softcover (Standard)</td>
                <td className="px-3 py-2 border border-gray-200">Global — most retailers, supermarkets, newsstands</td>
                <td className="px-3 py-2 border border-gray-200">~$4.99 / £4.99 / €5 / CHF 4.90</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Hardcover</td>
                <td className="px-3 py-2 border border-gray-200">Global — Amazon Collectors Bundle and select retailers</td>
                <td className="px-3 py-2 border border-gray-200">~$14.99 / £12.99</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Metallised Softcover</td>
                <td className="px-3 py-2 border border-gray-200">Switzerland only — United Edition</td>
                <td className="px-3 py-2 border border-gray-200">CHF 4.90</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Limited Hardcover (Treasure Box)</td>
                <td className="px-3 py-2 border border-gray-200">Switzerland only — numbered 1/5000 to 5000/5000</td>
                <td className="px-3 py-2 border border-gray-200">CHF premium</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Silver Hardcover</td>
                <td className="px-3 py-2 border border-gray-200">France only — premium tier</td>
                <td className="px-3 py-2 border border-gray-200">€ premium</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Gold Hardcover</td>
                <td className="px-3 py-2 border border-gray-200">France only — premium tier</td>
                <td className="px-3 py-2 border border-gray-200">€ premium</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
          There is no &ldquo;Platinum&rdquo; edition for the 2026 album. Any listing using that name is
          unofficial.
        </div>
      </section>

      {/* 3. Sticker Variants */}
      <section id="variants" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">3. Sticker Variants &amp; Parallels</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Base Finish</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li><span className="font-medium">Standard (matte)</span> — non-foil base stickers</li>
            <li>
              <span className="font-medium">Foil</span> — applied to sticker{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">00</code>, FWC-1 through FWC-8,
              and all 48 team emblems (49 foil stickers total)
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            North America Border Parallels (USA / Canada only)
          </h3>
          <p className="text-xs text-gray-500">
            Applied to non-foil stickers only. Found in physical packs sold in the USA and Canada.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Parallel</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Pull Rate</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                    Blue Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 2 packs</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-red-500 shrink-0" />
                    Red Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 25 packs</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                    Purple Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 200 packs</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
                    Green Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 1,400 packs</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-900 shrink-0" />
                    Black Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 of 1 (unique)</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-orange-400 shrink-0" />
                    Orange Border
                  </td>
                  <td className="px-3 py-2 border border-gray-200">Amazon 50-pack box exclusive</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Panini America iCollect &ldquo;Crumple&rdquo; Parallels (online-exclusive)
          </h3>
          <p className="text-xs text-gray-500">
            Available only through the Panini America iCollect digital store. Not found in physical
            packs.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Parallel</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Pull Rate</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
                    Gold Flood Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">6 per iCollect pack</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                    Blue Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 2</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-red-500 shrink-0" />
                    Red Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 26</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                    Purple Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 285</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
                    Green Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 in 1,529</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border border-gray-200 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-900 shrink-0" />
                    Black Crumple
                  </td>
                  <td className="px-3 py-2 border border-gray-200">1 of 1 (unique)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Other Regional Parallels</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>
              <span className="font-medium">Green (United Edition)</span> — Switzerland exclusive,
              found in the Panini United 2026 product line
            </li>
            <li>
              <span className="font-medium">Silver (players only)</span> — Belgium exclusive,
              found in Special Blister packs
            </li>
          </ul>
        </div>

        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
          <span className="font-semibold">Extra Stickers (international only):</span> 20 elite-player
          stickers in Purple, Bronze, Silver, and Gold variants exist for the international format —
          these are pulled 1 in 100 packs but have <span className="font-semibold">no album slot</span>.
          They are collectibles outside the base album.
        </div>
      </section>

      {/* 4. What's in the Album */}
      <section id="breakdown" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">4. What&apos;s in the Album (980 stickers)</h2>
        <p className="text-sm text-gray-600">
          The slot composition is identical across all regional editions. The album has 112 pages.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Section</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Slots</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Codes</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">We Are Panini</td>
                <td className="px-3 py-2 border border-gray-200">1</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">00</td>
                <td className="px-3 py-2 border border-gray-200">Foil</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">World Cup Branding</td>
                <td className="px-3 py-2 border border-gray-200">5</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">FWC-1 to FWC-5</td>
                <td className="px-3 py-2 border border-gray-200">Emblem ×2, Mascot, Slogan, Ball — all Foil</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Host Countries</td>
                <td className="px-3 py-2 border border-gray-200">3</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">FWC-6 to FWC-8</td>
                <td className="px-3 py-2 border border-gray-200">Canada, Mexico, USA emblems — all Foil</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">FIFA Museum (Past Champions)</td>
                <td className="px-3 py-2 border border-gray-200">11</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">FWC-9+</td>
                <td className="px-3 py-2 border border-gray-200">
                  Team photos of past WC winners. Some champions (e.g. Italy '38, Brazil '58,
                  England '66) are printed in the album, not collectible stickers.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">48 Teams</td>
                <td className="px-3 py-2 border border-gray-200">48 × 20 = 960</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">e.g. ARG-1 to ARG-20</td>
                <td className="px-3 py-2 border border-gray-200">
                  Per team: 1 Foil emblem + 18 player stickers + 1 team photo
                </td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">Coca-Cola Special</td>
                <td className="px-3 py-2 border border-gray-200">12</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">CC1 to CC12</td>
                <td className="px-3 py-2 border border-gray-200">
                  Double-page spread in the middle of the album. Not in standard packs — see
                  section 5.
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-800">
                <td className="px-3 py-2 border border-gray-200">Total</td>
                <td className="px-3 py-2 border border-gray-200">980</td>
                <td className="px-3 py-2 border border-gray-200" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 5. Coca-Cola */}
      <section id="coca-cola" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">5. Coca-Cola Special Section</h2>
        <p className="text-sm text-gray-600">
          Stickers <code className="text-xs bg-gray-100 px-1 rounded">CC1</code> to{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">CC12</code> fill a double-page spread
          in the middle of the album. They feature elite players selected in partnership with
          Coca-Cola, and the specific players vary by region.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Regional Set</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Distributed In</th>
                <th className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">NAOU</td>
                <td className="px-3 py-2 border border-gray-200">USA, Canada</td>
                <td className="px-3 py-2 border border-gray-200">Includes Antonee Robinson (USA), Alphonso Davies (Canada)</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">EUR</td>
                <td className="px-3 py-2 border border-gray-200">UK, Germany, France, Spain, Serbia</td>
                <td className="px-3 py-2 border border-gray-200">Includes William Saliba (France), Eduardo Camavinga (some variants)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">LATAM</td>
                <td className="px-3 py-2 border border-gray-200">Latin America</td>
                <td className="px-3 py-2 border border-gray-200">LATAM-specific player selection</td>
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">RoW</td>
                <td className="px-3 py-2 border border-gray-200">Rest of World</td>
                <td className="px-3 py-2 border border-gray-200">Includes Jordan Ayew (Ghana)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          All four sets share 12 album slots — the layout is the same, but which players are printed
          depends on where your packs were sold.
        </p>
      </section>

      {/* 6. Where to Buy */}
      <section id="where-to-buy" className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">6. Where to Buy</h2>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Physical Packs &amp; Albums</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>
                <span className="font-medium">Supermarkets &amp; newsstands</span> — Walmart, Target,
                Tesco, Carrefour, Rewe, Fnac and equivalents. Standard softcover album and loose
                packs (~5 stickers per pack).
              </li>
              <li>
                <span className="font-medium">Amazon</span> — Collectors Bundle with hardcover
                album; also carries the Orange Border Amazon-exclusive pack boxes (USA/Canada).
              </li>
              <li>
                <span className="font-medium">Panini official store (paniniamerica.net / panini.co.uk / panini.de etc.)</span>{' '}
                — starter packs, blister packs, multi-pack bundles, and regional exclusives.
              </li>
              <li>
                <span className="font-medium">Sports card &amp; hobby shops</span> — often carry
                full boxes and premium bundles; best source for box-break events.
              </li>
              <li>
                <span className="font-medium">Switzerland — Panini United 2026</span> — sold through
                Swiss Panini distributors and online at panini.ch; Treasure Box (numbered hardcover,
                1–5000 units) available there.
              </li>
              <li>
                <span className="font-medium">France — Silver / Gold Hardcover</span> — Fnac, Leclerc,
                and the Panini France online store.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Online / Digital</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>
                <span className="font-medium">Panini America iCollect</span> — digital packs with
                Crumple parallels exclusive to this platform (icollect.paniniamerica.net).
              </li>
              <li>
                <span className="font-medium">FIFA Panini Collection app</span> — official digital
                companion app; mirrors the print album layout per region.
              </li>
              <li>
                <span className="font-medium">eBay / Mercado Libre / Vinted</span> — secondary
                market for singles, sealed packs, and rare parallels.
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
          Prices and availability are approximate as of May 2026 and vary by retailer and country.
          Page-number references in Panini&apos;s album shift between regional editions — for
          exact placement, consult the table of contents in your specific album or the FIFA Panini
          Collection app.
        </div>
      </section>
    </div>
  );
}
