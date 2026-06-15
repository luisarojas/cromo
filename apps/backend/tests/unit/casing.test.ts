import { describe, it, expect } from 'vitest';
import { camelizeKeys } from '../../src/utils/casing.js';

describe('camelizeKeys', () => {
  it('camelizes flat snake_case keys', () => {
    const out = camelizeKeys({ user_id: 'abc', first_name: 'Luisa' });
    expect(out).toEqual({ userId: 'abc', firstName: 'Luisa' });
  });

  it('recurses into nested objects and arrays', () => {
    const out = camelizeKeys({
      outer_key: {
        inner_value: 1,
        nested_list: [{ list_item_id: 'x' }, { list_item_id: 'y' }],
      },
    });
    expect(out).toEqual({
      outerKey: {
        innerValue: 1,
        nestedList: [{ listItemId: 'x' }, { listItemId: 'y' }],
      },
    });
  });

  it('leaves keys without underscores unchanged (fast path)', () => {
    expect(camelizeKeys({ email: 'a@b.c', already: 'fine' })).toEqual({
      email: 'a@b.c',
      already: 'fine',
    });
  });

  it('preserves leading underscores (e.g. __proto__-style keys)', () => {
    // The regex uses `(?<!^)` so an underscore at position 0 is never
    // collapsed away.
    const out = camelizeKeys({ _internal_field: 1 });
    expect(out).toEqual({ _internalField: 1 });
  });

  it('passes through primitives and null/undefined unchanged', () => {
    expect(camelizeKeys(null)).toBeNull();
    expect(camelizeKeys(undefined)).toBeUndefined();
    expect(camelizeKeys(42)).toBe(42);
    expect(camelizeKeys('a_string_with_underscores')).toBe('a_string_with_underscores');
    expect(camelizeKeys(true)).toBe(true);
  });

  it('passes through Date and Buffer instances without recursing', () => {
    // Non-plain objects must survive — Drizzle/pg returns Date for timestamps
    // and the serializer must not destructure them.
    const date = new Date('2026-01-01T00:00:00Z');
    expect(camelizeKeys(date)).toBe(date);

    const buf = Buffer.from('hello');
    expect(camelizeKeys(buf)).toBe(buf);
  });

  it('camelizes inside arrays at the top level', () => {
    expect(
      camelizeKeys([{ row_id: 1 }, { row_id: 2 }]),
    ).toEqual([{ rowId: 1 }, { rowId: 2 }]);
  });

  it('handles digit boundaries (snake_case2 → snakeCase2)', () => {
    // The regex captures [a-z0-9], so "v2_pro" becomes "v2Pro".
    expect(camelizeKeys({ v2_pro: 1 })).toEqual({ v2Pro: 1 });
  });
});
