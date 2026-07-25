import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mutable env so each test can flip AUTH_MODE at call time. `verifyBearerSub`
// reads `env.AUTH_MODE` inside the function body, so mutating this object
// between tests selects the branch under test. Declared via vi.hoisted so the
// hoisted vi.mock factories below can close over it.
const { mockEnv, verifyCognitoJwtMock } = vi.hoisted(() => ({
  mockEnv: {
    AUTH_MODE: 'local' as 'local' | 'cognito',
    JWT_SECRET: 'unit-test-secret',
  },
  verifyCognitoJwtMock: vi.fn(),
}));
vi.mock('../../src/env.js', () => ({ env: mockEnv }));

// Mock the Cognito verifier so the cognito branch doesn't drag in jose/JWKS.
vi.mock('../../src/middleware/cognito.js', () => ({
  verifyCognitoJwt: (token: string) => verifyCognitoJwtMock(token),
}));

import { verifyBearerSub } from '../../src/middleware/auth.js';

beforeEach(() => {
  verifyCognitoJwtMock.mockReset();
  mockEnv.AUTH_MODE = 'local';
});

// This suite is the regression guard for the live-trade / trade-SSE 401 bug:
// host auth in those routes used to verify the Bearer with JWT_SECRET
// unconditionally, which rejects every RS256 Cognito token in cognito mode.
// The whole point is that verification MUST follow AUTH_MODE, so both branches
// are asserted here — a local-only test (like the integration suite) cannot
// see the cognito regression.
describe('verifyBearerSub', () => {
  describe('AUTH_MODE=local', () => {
    it('returns the sub of a valid access token signed with JWT_SECRET', async () => {
      const token = jwt.sign({ sub: 'user-1', type: 'access' }, mockEnv.JWT_SECRET);
      expect(await verifyBearerSub(token)).toBe('user-1');
    });

    it('returns null for a refresh token (wrong type)', async () => {
      const token = jwt.sign({ sub: 'user-1', type: 'refresh' }, mockEnv.JWT_SECRET);
      expect(await verifyBearerSub(token)).toBeNull();
    });

    it('returns null for a token signed with the wrong secret', async () => {
      const token = jwt.sign({ sub: 'user-1', type: 'access' }, 'not-the-secret');
      expect(await verifyBearerSub(token)).toBeNull();
    });

    it('returns null for garbage', async () => {
      expect(await verifyBearerSub('not-a-jwt')).toBeNull();
    });

    it('does NOT delegate to the Cognito verifier in local mode', async () => {
      const token = jwt.sign({ sub: 'user-1', type: 'access' }, mockEnv.JWT_SECRET);
      await verifyBearerSub(token);
      expect(verifyCognitoJwtMock).not.toHaveBeenCalled();
    });
  });

  describe('AUTH_MODE=cognito', () => {
    beforeEach(() => {
      mockEnv.AUTH_MODE = 'cognito';
    });

    it('returns the sub resolved by verifyCognitoJwt', async () => {
      verifyCognitoJwtMock.mockResolvedValue({ sub: 'cognito-user-9', email: '', role: 'user' });
      expect(await verifyBearerSub('cognito-access-token')).toBe('cognito-user-9');
      expect(verifyCognitoJwtMock).toHaveBeenCalledWith('cognito-access-token');
    });

    it('returns null when verifyCognitoJwt rejects', async () => {
      verifyCognitoJwtMock.mockRejectedValue(new Error('bad token'));
      expect(await verifyBearerSub('bad')).toBeNull();
    });

    it('does NOT fall back to JWT_SECRET verification in cognito mode', async () => {
      // A token that WOULD verify under JWT_SECRET must still be rejected when
      // Cognito rejects it — the local path must not silently accept it.
      verifyCognitoJwtMock.mockRejectedValue(new Error('not a cognito token'));
      const localToken = jwt.sign({ sub: 'user-1', type: 'access' }, mockEnv.JWT_SECRET);
      expect(await verifyBearerSub(localToken)).toBeNull();
    });
  });
});
