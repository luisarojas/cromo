import jwt from 'jsonwebtoken';
import { env } from '../env.js';

// Signed unsubscribe tokens for the List-Unsubscribe / one-click flow
// (RFC 8058). The token encodes which user wants to opt out of which
// channel, signed with JWT_SECRET. Long TTL (1 year) because users may
// click an old email link months after it was sent.
//
// The token does NOT include the email address itself — we resolve the
// recipient by user id at unsubscribe time. This keeps the URL short and
// doesn't leak the address into anything the mail client logs.

type UnsubScope = 'trade-messages' | 'all';

interface UnsubPayload {
  sub: string;          // userId
  scope: UnsubScope;
  type: 'email-unsub';
}

export function mintUnsubToken(userId: string, scope: UnsubScope): string {
  return jwt.sign(
    { scope, type: 'email-unsub' as const },
    env.JWT_SECRET,
    { subject: userId, expiresIn: '365d' },
  );
}

export function verifyUnsubToken(token: string): UnsubPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<UnsubPayload>;
  if (payload.type !== 'email-unsub' || !payload.sub || !payload.scope) {
    throw new Error('Invalid unsubscribe token');
  }
  if (payload.scope !== 'trade-messages' && payload.scope !== 'all') {
    throw new Error('Unknown unsubscribe scope');
  }
  return payload as UnsubPayload;
}
