'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchStickersBulk, type StickerVariant } from '@/lib/api';
import { variantLabel, variantSwatch } from '@/app/album/components/variantMeta';

export interface TradePickerItem {
  variantId: string;
  direction: 'offer' | 'want';
  quantity: 1;
}

interface LineItem {
  key: string;
  albumCode: string;
  variantId: string;
  variantType: string;
  playerName: string | null;
  teamName: string | null;
  allVariants: StickerVariant[];
  direction: 'offer' | 'want';
  loading: boolean;
  error: string | null;
}

interface Props {
  offerCodes: string[];
  wantCodes: string[];
  token: string;
  onChange: (items: TradePickerItem[]) => void;
}

let lineKeySeq = 0;
function nextKey() {
  return String(++lineKeySeq);
}

export default function TradeStickerPicker({ offerCodes, wantCodes, token, onChange }: Props) {
  const [lines, setLines] = useState<LineItem[]>([]);
  const [offerInput, setOfferInput] = useState('');
  const [wantInput, setWantInput] = useState('');
  const [offerAdding, setOfferAdding] = useState(false);
  const [wantAdding, setWantAdding] = useState(false);
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const valid = lines.filter((l) => !l.loading && !l.error && l.variantId);
    onChangeRef.current(valid.map((l) => ({ variantId: l.variantId, direction: l.direction, quantity: 1 as const })));
  }, [lines]);

  async function loadByCode(albumCode: string, direction: 'offer' | 'want'): Promise<Omit<LineItem, 'key'>> {
    try {
      const results = await fetchStickersBulk([albumCode], token);
      const result = results[0];
      if (!result) throw new Error('Not found');
      const base = result.variants.find((v) => v.variant_type === 'base') ?? result.variants[0] ?? null;
      return {
        albumCode: result.album_code,
        variantId: base?.id ?? '',
        variantType: base?.variant_type ?? 'base',
        playerName: result.player_name,
        teamName: result.team_name,
        allVariants: result.variants,
        direction,
        loading: false,
        error: null,
      };
    } catch {
      return {
        albumCode,
        variantId: '',
        variantType: 'base',
        playerName: null,
        teamName: null,
        allVariants: [],
        direction,
        loading: false,
        error: 'Not found',
      };
    }
  }

  // Load initial suggestions once on mount — single bulk request instead of N×2.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const entries = [
      ...offerCodes.map((c) => ({ code: c, direction: 'offer' as const })),
      ...wantCodes.map((c) => ({ code: c, direction: 'want' as const })),
    ];
    if (entries.length === 0) return;

    const keys = entries.map(() => nextKey());
    setLines(
      entries.map(({ code, direction }, i) => ({
        key: keys[i]!,
        albumCode: code,
        variantId: '',
        variantType: 'base',
        playerName: null,
        teamName: null,
        allVariants: [],
        direction,
        loading: true,
        error: null,
      })),
    );

    const allCodes = entries.map((e) => e.code);
    fetchStickersBulk(allCodes, token).then((results) => {
      const byCode = new Map(results.map((r) => [r.album_code, r]));
      setLines((prev) =>
        prev.map((l, i) => {
          const entry = entries[i];
          if (!entry || !l.loading) return l;
          const result = byCode.get(entry.code);
          if (!result) return { ...l, loading: false, error: 'Not found' };
          const base = result.variants.find((v) => v.variant_type === 'base') ?? result.variants[0] ?? null;
          return {
            ...l,
            albumCode: result.album_code,
            variantId: base?.id ?? '',
            variantType: base?.variant_type ?? 'base',
            playerName: result.player_name,
            teamName: result.team_name,
            allVariants: result.variants,
            loading: false,
            error: null,
          };
        }),
      );
    }).catch(() => {
      setLines((prev) => prev.map((l) => l.loading ? { ...l, loading: false, error: 'Failed to load' } : l));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeItem(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function changeVariant(key: string, variant: StickerVariant) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, variantId: variant.id, variantType: variant.variant_type } : l,
      ),
    );
  }

  async function handleAdd(direction: 'offer' | 'want') {
    const raw = direction === 'offer' ? offerInput : wantInput;
    const code = raw.trim().toUpperCase();
    if (!code) return;

    if (direction === 'offer') {
      setOfferInput('');
      setOfferAdding(true);
    } else {
      setWantInput('');
      setWantAdding(true);
    }

    const key = nextKey();
    setLines((prev) => [
      ...prev,
      {
        key,
        albumCode: code,
        variantId: '',
        variantType: 'base',
        playerName: null,
        teamName: null,
        allVariants: [],
        direction,
        loading: true,
        error: null,
      },
    ]);

    const data = await loadByCode(code, direction);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...data, key } : l)));

    if (direction === 'offer') setOfferAdding(false);
    else setWantAdding(false);
  }

  const offerLines = lines.filter((l) => l.direction === 'offer');
  const wantLines = lines.filter((l) => l.direction === 'want');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <StickerPanel
        title="You're Offering"
        color="blue"
        lines={offerLines}
        onRemove={removeItem}
        onVariantChange={changeVariant}
        inputValue={offerInput}
        onInputChange={setOfferInput}
        onAdd={() => handleAdd('offer')}
        adding={offerAdding}
      />
      <StickerPanel
        title="You Want"
        color="emerald"
        lines={wantLines}
        onRemove={removeItem}
        onVariantChange={changeVariant}
        inputValue={wantInput}
        onInputChange={setWantInput}
        onAdd={() => handleAdd('want')}
        adding={wantAdding}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StickerPanel({
  title,
  color,
  lines,
  onRemove,
  onVariantChange,
  inputValue,
  onInputChange,
  onAdd,
  adding,
}: {
  title: string;
  color: 'blue' | 'emerald';
  lines: LineItem[];
  onRemove: (key: string) => void;
  onVariantChange: (key: string, v: StickerVariant) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const cls = {
    bg: color === 'blue' ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100',
    title: color === 'blue' ? 'text-blue-700' : 'text-emerald-700',
    btn: color === 'blue'
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white',
    ring: color === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-emerald-500',
  };

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${cls.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-sm font-semibold ${cls.title}`}>{title}</h3>
        {lines.length > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{lines.filter((l) => !l.loading && !l.error && l.variantId).length} sticker{lines.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {lines.length === 0 && !adding ? (
        <p className="text-xs text-gray-400 text-center py-4">
          Add stickers below or they were pre-filled from suggestions.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {lines.map((line) => (
            <LineCard
              key={line.key}
              line={line}
              onRemove={() => onRemove(line.key)}
              onVariantChange={(v) => onVariantChange(line.key, v)}
            />
          ))}
          {adding && <div className="h-9 rounded-lg bg-white/70 animate-pulse" />}
        </div>
      )}

      <div className="flex gap-1.5 mt-auto pt-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add by code (e.g. FIFA001)"
          className={`flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 ${cls.ring}`}
        />
        <button
          onClick={onAdd}
          disabled={!inputValue.trim() || adding}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors ${cls.btn}`}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function LineCard({
  line,
  onRemove,
  onVariantChange,
}: {
  line: LineItem;
  onRemove: () => void;
  onVariantChange: (v: StickerVariant) => void;
}) {
  if (line.loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-200 animate-pulse shrink-0" />
        <div className="flex-1 h-3.5 bg-gray-200 animate-pulse rounded" />
        <div className="w-16 h-5 bg-gray-200 animate-pulse rounded shrink-0" />
      </div>
    );
  }

  if (line.error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-2">
        <span className="flex-1 text-xs text-red-500 truncate">
          {line.albumCode} — {line.error}
        </span>
        <button
          onClick={onRemove}
          className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
          aria-label="Remove"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
      {/* Variant color swatch */}
      <span
        className={`shrink-0 inline-block w-2.5 h-2.5 rounded-full border border-gray-300 ${variantSwatch(line.variantType)}`}
        aria-hidden
      />

      {/* Sticker info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-800 truncate">
          <span className="font-semibold">{line.albumCode}</span>
          {line.playerName && (
            <span className="text-gray-500 font-normal"> · {line.playerName}</span>
          )}
        </div>
        {line.teamName && (
          <div className="text-[10px] text-gray-400 truncate leading-none mt-0.5">{line.teamName}</div>
        )}
      </div>

      {/* Variant selector */}
      {line.allVariants.length > 1 ? (
        <select
          value={line.variantId}
          onChange={(e) => {
            const v = line.allVariants.find((v) => v.id === e.target.value);
            if (v) onVariantChange(v);
          }}
          className="shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[100px]"
        >
          {line.allVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {variantLabel(v.variant_type)}
            </option>
          ))}
        </select>
      ) : (
        <span className="shrink-0 text-[11px] text-gray-400">
          {variantLabel(line.variantType)}
        </span>
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-lg leading-none ml-0.5"
        aria-label={`Remove ${line.albumCode}`}
      >
        ×
      </button>
    </div>
  );
}
