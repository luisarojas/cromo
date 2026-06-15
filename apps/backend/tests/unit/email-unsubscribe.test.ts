import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  mintUnsubToken,
  verifyUnsubToken,
} from '../../src/services/email-unsubscribe.service.js';
import { env } from '../../src/env.js';

describe('mintUnsubToken / verifyUnsubToken', () => {
  it('round-trips a trade-messages opt-out for the same user', () => {
    const token = mintUnsubToken('user-1', 'trade-messages');
    const payload = verifyUnsubToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.scope).toBe('trade-messages');
    expect(payload.type).toBe('email-unsub');
  });

  it('round-trips a global ("all") opt-out', () => {
    const token = mintUnsubToken('user-2', 'all');
    expect(verifyUnsubToken(token).scope).toBe('all');
  });

  it('rejects a JWT signed with a different secret', () => {
    const forged = jwt.sign(
      { scope: 'all', type: 'email-unsub' },
      'someone-elses-secret',
      { subject: 'user-3', expiresIn: '1h' },
    );
    expect(() => verifyUnsubToken(forged)).toThrow();
  });

  it('rejects a JWT with the wrong type discriminator', () => {
    // Same secret, but `type: 'access'` instead of 'email-unsub' — represents
    // someone trying to pass an auth token as an unsubscribe token.
    const wrongType = jwt.sign(
      { scope: 'all', type: 'access' },
      env.JWT_SECRET,
      { subject: 'user-4', expiresIn: '1h' },
    );
    expect(() => verifyUnsubToken(wrongType)).toThrow(/Invalid unsubscribe token/);
  });

  it('rejects an unknown scope value', () => {
    const badScope = jwt.sign(
      { scope: 'marketing', type: 'email-unsub' },
      env.JWT_SECRET,
      { subject: 'user-5', expiresIn: '1h' },
    );
    expect(() => verifyUnsubToken(badScope)).toThrow(/Unknown unsubscribe scope/);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { scope: 'all', type: 'email-unsub' },
      env.JWT_SECRET,
      { subject: 'user-6', expiresIn: '-1s' },
    );
    expect(() => verifyUnsubToken(expired)).toThrow();
  });
});
