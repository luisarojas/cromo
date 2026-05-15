'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { VARIANT_META, variantSwatch } from './variantMeta';

interface Props {
  mode: 'add' | 'remove';
  availableTypes: string[];
  onConfirm: (variantType: string) => void;
  onClose: () => void;
}

export default function VariantPickerModal({ mode, availableTypes, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string>(availableTypes[0] ?? '');

  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-72 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {mode === 'add' ? 'Add Variant' : 'Remove Variant'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">
            ×
          </button>
        </div>

        <p className="text-xs text-gray-500 -mt-1">
          {mode === 'add'
            ? "Pick a variant type to add to all selected stickers that don't already own it."
            : 'Pick a variant type to remove from all selected stickers that own it.'}
        </p>

        {availableTypes.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2 text-center">No variants available.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto -mx-1 px-1">
            {availableTypes.map((type) => {
              const meta = VARIANT_META[type];
              return (
                <button
                  key={type}
                  onClick={() => setSelected(type)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors border ${
                    selected === type
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-white border-transparent hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block w-3.5 h-3.5 rounded-full border border-gray-300 flex-shrink-0 ${variantSwatch(type)}`}
                  />
                  <span className="text-sm flex-1">{meta?.label ?? type}</span>
                  {selected === type && (
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (selected) onConfirm(selected); }}
            disabled={!selected || availableTypes.length === 0}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'add' ? 'Add' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
