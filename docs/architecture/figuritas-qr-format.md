# Figuritas QR Format — Reverse-Engineering Notes (PARKED)

> **Status:** Decode parked. The "Import from another app → Figuritas" entry point
> is **disabled** via `available: false` in `apps/frontend/src/app/trade/thirdPartyImport.ts`.
> The parser (`parseFiguritas.ts`) still **recognises** the format and returns
> `unsupported-encoding` (honest "compact format Cromo can't read yet" message),
> so nothing crashes. Re-enable by flipping `available` once the open problems
> below are solved.

## What this is

[Figuritas](https://www.figuritas.app) is a LatAm sticker-swap app for the Panini
World Cup 2026 album. Its in-app "share my list" QR encodes a collector's needs
and duplicates. The goal was: a Cromo user scans/uploads a Figuritas QR and we
match that list against their collection — entirely client-side, no Figuritas API.

The original implementation (`parseFiguritas.ts`, commit `fa3f40f`) assumed a
human-readable text format (`FIGURITAS_USA2026_EXPORT` / `NEED[...]` / `SWAP[...]`).
**That format was speculative and does not exist.** Real QRs are a compact binary
format, decoded below.

## The envelope — FULLY DECODED ✅

A real Figuritas QR's text payload is:

```
⋋~  H4sI……  ;  H4sI……=
```

- **Magic header:** 4 bytes `e2 8b 8b 7e` (UTF-8 for `⋋~`, U+22CB + `~`).
- **Two `;`-separated blobs**, each **gzip then base64** (the `H4sI` prefix is the
  base64 of the gzip magic `1f 8b 08`).
- Each blob inflates to a **bitfield**: **MSB-first, 1 bit per sticker.**
  - **Blob 0 = needs** (stickers wanted).
  - **Blob 1 = swaps** (duplicates offered).
- Bitfield length varies between exports (observed 984 and 1000 bits) — see open
  problem #3.

Decode recipe (Node, using deps already in the frontend image — `jsqr`, `sharp`,
`zlib`):

```js
const hit = jsQR(rgba, w, h);                       // QR → text (use hit.binaryData)
const bytes = Buffer.from(hit.binaryData);
const start = bytes.indexOf(Buffer.from("H4sI"));   // skip the ⋋~ magic
const blobs = bytes.slice(start).toString("latin1").split(";")
  .map(p => zlib.gunzipSync(Buffer.from(p, "base64")));
// MSB-first bit i set  ⇔  blobs[n][i>>3] & (0x80 >> (i & 7))
```

## The macro-structure — PARTLY VERIFIED ⚠️

Two clean known-plaintext samples (both with **exact** popcount agreement, so the
lists are trustworthy):

- `figuritas-samples/sample-qr-2.png` — 961 needs / 4 swaps (near-complete collection).
- `figuritas-samples/sample-qr-3.png` — **592 needs / 31 swaps** — counts matched the
  list *exactly*, including a Coca-Cola (CC) section. This is the **best reference
  sample**: a partial collection with broad per-team coverage. Its validated
  ground-truth list is committed alongside as `figuritas-samples/sample-qr-3.list.txt`.

Confirmed:

- **Section order follows Cromo's album order**: a front (FWC/intro) block, then the 48
  teams in `stickers.number` order
  (`MEX RSA KOR CZE CAN BIH QAT SUI BRA MAR HAI SCO USA PAR AUS TUR GER CUW CIV ECU
   NED JPN SWE TUN BEL EGY IRN NZL ESP CPV KSA URU FRA SEN IRQ NOR ARG ALG AUT JOR
   POR COD UZB COL ENG CRO GHA PAN`), then a CC (Coca-Cola) block at the end.
- The CC block explains the variable length: sample-2 (no CC content) is 984 bits;
  sample-3 (has CC) is 1000. Length is trimmed to the last byte holding a set bit.

**DISPROVEN — teams are NOT contiguous 20-bit blocks.** This was the working assumption
through samples 1–2, but `sample-qr-3` (accurate partial) breaks it decisively:

- Three teams are fully needed (CAN, SWE, ESP → each must be 20 set bits). If teams were
  contiguous, each would be a run of 20 consecutive set bits. **The entire bitfield has
  exactly ONE 20-run** (`[464,483]`). So at most one of the three full teams is
  contiguous; CAN and ESP are not.
- Sliding each team's 20-bit window ±8 bits around every plausible base and matching the
  permutation-invariant set-count to the known need-count, **5 teams (MEX, CAN, MAR, ECU,
  ESP) have NO matching window anywhere** — impossible for a contiguous block that must
  exist somewhere.
- The earlier "F=24 / SWE `[464,483]` anchor" was almost certainly a **coincidental dense
  run** (that region is bordered by partial teams JPN/TUN whose set bits fill in a 20-run),
  not a real team boundary. Sample-2 hid all of this: being near-complete, almost every
  bit is set, so any windowing looks aligned.

So the bit→sticker ordering is **non-contiguous and not yet identified.** It is a genuine
1-bit-per-sticker bitfield (popcount = need-count, exactly, in every sample), but the
stickers are not laid out as simple per-team blocks — possibly column-major (all #1s,
then all #2s…), interleaved by album page, or another scheme.

## Open problems — why decode is PARKED 🚧

**The single open problem is the bit→sticker ordering.** Everything else (envelope,
needs/swaps split, 1-bit-per-sticker, section order, exact ground-truth lists) is solved.
The ordering is non-contiguous (see above), so structural guesses (per-team blocks) have
been ruled out and a brute-force-the-structure approach is the wrong tool.

The robust way to nail an unknown permutation of N≈1000 slots is **signature matching**,
which assumes no structure at all:

- With *S* known sample pairs, every sticker gets an *S*-bit signature (needed in
  sample 1? 2? … in blob 0), and every bit position gets an *S*-bit signature (set in
  sample 1? 2? …). The true bit→sticker map must pair equal signatures.
- 2 samples → only 4 signature classes (far too coarse: ~250 sticker per class). With
  **~10–12 varied partial samples**, almost every sticker's signature is unique, so the
  mapping falls out by a direct signature join — **no structural assumptions, and it
  self-validates** (a wrong map leaves signature collisions).

## How to resume

1. **Collect ~10–12 sample pairs** (QR + its exact ASCII list, no emoji), each a
   *different, partial* collection (varied needs maximise signature entropy). Commit them
   under a fixtures dir. Keep the popcount==list-count check as the per-sample integrity
   gate — only use pairs that pass.
2. **Build the bit→sticker map by signature join** across all samples (decode recipe
   above for the bits; the lists give each sticker's signature). Resolve any remaining
   ties using the known section order (FWC front, teams in album order, CC last) — that
   ordering *is* trustworthy even though within-section layout isn't.
3. **Validate with zero error**: the recovered map must reproduce every sample's needs
   AND swaps exactly (the codebase forbids fabricated matches).
4. Implement the decoder in `parseFiguritas.ts` (replace the `unsupported-encoding`
   branch), then flip `available: true` in `thirdPartyImport.ts`.

Two samples are not enough — the blocker now is **sample count**, not sample quality.

## Code pointers

- `apps/frontend/src/app/trade/figuritas/parseFiguritas.ts` — parser; currently detects
  the binary format and returns `unsupported-encoding`.
- `apps/frontend/src/app/trade/thirdPartyImport.ts` — app registry; `available` flag
  gates the UI entry point.
- `apps/frontend/src/app/trade/components/ThirdPartyAppImport.tsx` — chooser + QR
  scanner UI; hides the button when no app is `available`.
