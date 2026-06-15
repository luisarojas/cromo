import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jose's JWKS + verify so we can script claims per test.
const jwtVerifyMock = vi.fn();
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'fake-jwks-fn'),
  jwtVerify: (token: string, _jwks: unknown, opts: unknown) => jwtVerifyMock(token, opts),
}));

vi.mock('../../src/env.js', () => ({
  env: {
    COGNITO_REGION: 'ca-central-1',
    COGNITO_USER_POOL_ID: 'ca-central-1_TEST',
    COGNITO_CLIENT_ID: 'client-abc',
    COGNITO_TOKEN_USE: 'access' as const,
  },
}));

import { verifyCognitoJwt } from '../../src/middleware/cognito.js';

beforeEach(() => {
  jwtVerifyMock.mockReset();
});

describe('verifyCognitoJwt (access tokens)', () => {
  it('returns sub + role from a valid access token whose client_id matches', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'user-1',
        token_use: 'access',
        client_id: 'client-abc',
        'cognito:groups': [],
      },
    });
    const out = await verifyCognitoJwt('jwt-1');
    expect(out).toEqual({ sub: 'user-1', email: '', role: 'user' });
  });

  it('marks role=admin when the token carries the admin group', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'user-2',
        token_use: 'access',
        client_id: 'client-abc',
        'cognito:groups': ['admin', 'beta'],
      },
    });
    expect((await verifyCognitoJwt('jwt-2')).role).toBe('admin');
  });

  it('rejects an access token whose token_use is not "access"', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'u', token_use: 'id', client_id: 'client-abc' },
    });
    await expect(verifyCognitoJwt('jwt-3')).rejects.toThrow(/token_use=access/);
  });

  it('rejects an access token whose client_id does not match the configured value', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'u', token_use: 'access', client_id: 'evil-app' },
    });
    await expect(verifyCognitoJwt('jwt-4')).rejects.toThrow(/client_id does not match/);
  });

  it('rejects when the sub claim is missing', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { token_use: 'access', client_id: 'client-abc' },
    });
    await expect(verifyCognitoJwt('jwt-5')).rejects.toThrow(/Token missing sub claim/);
  });

  it('does NOT enforce the aud claim for access tokens (jose audience option omitted)', async () => {
    // Asserted via the options passed to jwtVerify.
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'u', token_use: 'access', client_id: 'client-abc' },
    });
    await verifyCognitoJwt('jwt-6');
    const [, opts] = jwtVerifyMock.mock.calls[0]!;
    expect(opts).toMatchObject({ issuer: expect.stringContaining('ca-central-1_TEST') });
    expect((opts as { audience?: unknown }).audience).toBeUndefined();
  });
});
