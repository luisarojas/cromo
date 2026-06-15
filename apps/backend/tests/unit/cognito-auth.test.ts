import { describe, it, expect } from 'vitest';
import { deriveUsername, type IdClaims } from '../../src/services/cognito-auth.service.js';

function claims(overrides: Partial<IdClaims> = {}): IdClaims {
  return { sub: 'sub-1', ...overrides };
}

describe('deriveUsername', () => {
  it('prefers the custom:username attribute when ≥ 3 chars', () => {
    expect(deriveUsername(claims({ 'custom:username': 'luisa' }))).toBe('luisa');
  });

  it('falls back to the email local part when custom:username is missing', () => {
    expect(deriveUsername(claims({ email: 'alice@example.com' }))).toBe('alice');
  });

  it('falls back when custom:username is too short (< 3 chars)', () => {
    // Short attributes are a leftover from the Terraform-bootstrap path
    // (CLAUDE.md auth rule). The fallback must still kick in.
    expect(
      deriveUsername(claims({ 'custom:username': 'ab', email: 'bob@example.com' })),
    ).toBe('bob');
  });

  it('strips invalid characters from the email local part', () => {
    // Only [a-z0-9_-] survive; spaces, dots, plus tags all go.
    expect(deriveUsername(claims({ email: 'first.last+tag@example.com' }))).toBe(
      'firstlasttag',
    );
  });

  it('truncates to 30 characters maximum', () => {
    const long = 'a'.repeat(40) + '@example.com';
    const out = deriveUsername(claims({ email: long }));
    expect(out).toHaveLength(30);
    expect(out).toBe('a'.repeat(30));
  });

  it('pads short fallback values to 3 chars with "0"', () => {
    // "a@x" → local "a" → padded to "a00" so the result clears the 3-char
    // minimum used elsewhere in the user surface.
    expect(deriveUsername(claims({ email: 'a@example.com' }))).toBe('a00');
  });

  it('returns "000" when there is no email at all', () => {
    // No claims have given us anything to work with; the fallback still has
    // to produce a 3-char identifier rather than throw.
    expect(deriveUsername(claims())).toBe('000');
  });
});
