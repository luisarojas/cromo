/**
 * Recursive snake_case → camelCase key conversion for JSON responses.
 * Pass through Buffers, Dates, and primitives unchanged.
 */

function snakeToCamel(s: string): string {
  // Skip keys that don't contain underscores (fast path) or look intentional
  // (leading underscores like __proto__ or string-number patterns).
  if (!s.includes('_')) return s;
  return s.replace(/(?<!^)_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function camelizeKeys<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => camelizeKeys(v)) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  // Pass through non-plain objects (Date, Buffer, etc.)
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[snakeToCamel(key)] = camelizeKeys(val);
  }
  return out as unknown as T;
}
