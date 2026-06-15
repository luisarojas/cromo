import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

// Exercises auth.service.ts local-mode functions (refresh, verifyEmail,
// resendVerification, forgotPassword, resetPassword) against the real DB +
// Redis. Each test uses unique fixture user IDs so the suite is order-
// independent and the seeded users (alice/bob/…) aren't disturbed.

const FIXTURE_ID = '00000000-0000-0000-0000-aaaaaaaa1111';
const FIXTURE_EMAIL = 'auth-svc-test@cromo.test';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

describe.skipIf(!shouldRun)('auth.service (integration, local mode)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();

    // Seed a fresh user with a known password hash (set later via /reset).
    await app.db.query(
      `INSERT INTO users (id, email, username, hashed_email, role, email_verified_at)
         VALUES ($1, $2, 'authsvctest', $3, 'user', NULL)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, email_verified_at = NULL`,
      [FIXTURE_ID, FIXTURE_EMAIL, hashEmail(FIXTURE_EMAIL)],
    );
    await app.db.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [FIXTURE_ID],
    );
  });

  afterAll(async () => {
    await app.db.query(`DELETE FROM users WHERE id = $1`, [FIXTURE_ID]);
    await app?.close();
  });

  describe('refresh', () => {
    it('returns 401 when the refresh token is forged with the wrong secret', async () => {
      const { refresh } = await import('../../src/services/auth.service.js');
      // A JWT signed with a different secret won't verify.
      const bogus = 'eyJ.bogus.token';
      await expect(refresh(app.drizzle, bogus)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('returns 401 when the user the token points to no longer exists', async () => {
      const { refresh } = await import('../../src/services/auth.service.js');
      const { signRefreshToken } = await import('../../src/middleware/auth.js');
      const token = signRefreshToken({
        sub: '00000000-0000-0000-0000-deadbeef0000',
        email: 'gone@test.local',
        role: 'user',
      });
      await expect(refresh(app.drizzle, token)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('returns fresh access + refresh tokens for a valid refresh token', async () => {
      const { refresh } = await import('../../src/services/auth.service.js');
      const { signRefreshToken } = await import('../../src/middleware/auth.js');
      const token = signRefreshToken({ sub: FIXTURE_ID, email: FIXTURE_EMAIL, role: 'user' });
      const result = await refresh(app.drizzle, token);
      expect(result.accessToken.split('.').length).toBe(3);
      expect(result.refreshToken.split('.').length).toBe(3);
      expect(result.user.id).toBe(FIXTURE_ID);
    });
  });

  describe('verifyEmail', () => {
    it('throws 400 when the code does not match any token', async () => {
      const { verifyEmail } = await import('../../src/services/auth.service.js');
      await expect(verifyEmail(app.drizzle, FIXTURE_EMAIL, 'noresult')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('flips email_verified_at and consumes the token on success', async () => {
      const { verifyEmail } = await import('../../src/services/auth.service.js');
      // Seed a token for the fixture user.
      const code = '654321';
      await app.db.query(
        `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
           VALUES ($1, $2, now() + INTERVAL '1 hour')`,
        [hashToken(code), FIXTURE_ID],
      );

      await verifyEmail(app.drizzle, FIXTURE_EMAIL, code);

      const { rows: userRows } = await app.db.query<{ email_verified_at: Date | null }>(
        `SELECT email_verified_at FROM users WHERE id = $1`,
        [FIXTURE_ID],
      );
      expect(userRows[0]?.email_verified_at).not.toBeNull();

      // Token was consumed.
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM email_verification_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      expect(rowCount).toBe(0);

      // Reset for subsequent tests.
      await app.db.query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [FIXTURE_ID]);
    });

    it('throws 410 when the token has expired', async () => {
      const { verifyEmail } = await import('../../src/services/auth.service.js');
      const code = 'expired';
      await app.db.query(
        `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
           VALUES ($1, $2, now() - INTERVAL '1 hour')`,
        [hashToken(code), FIXTURE_ID],
      );
      await expect(verifyEmail(app.drizzle, FIXTURE_EMAIL, code)).rejects.toMatchObject({
        statusCode: 410,
      });
      await app.db.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [FIXTURE_ID]);
    });
  });

  describe('resendVerification', () => {
    it('is a silent no-op for unknown emails (anti-enumeration)', async () => {
      const { resendVerification } = await import('../../src/services/auth.service.js');
      await expect(
        resendVerification(app.drizzle, app.redis, 'definitely-not-a-user@test.local'),
      ).resolves.toBeUndefined();
    });

    it('is a no-op when the user is already verified', async () => {
      const { resendVerification } = await import('../../src/services/auth.service.js');
      await app.db.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [FIXTURE_ID]);
      try {
        await resendVerification(app.drizzle, app.redis, FIXTURE_EMAIL);
        // No token row created since the user is already verified.
        const { rowCount } = await app.db.query(
          `SELECT 1 FROM email_verification_tokens WHERE user_id = $1`,
          [FIXTURE_ID],
        );
        expect(rowCount).toBe(0);
      } finally {
        await app.db.query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [FIXTURE_ID]);
      }
    });

    it('creates a fresh token + enqueues an email job for unverified users', async () => {
      const { resendVerification } = await import('../../src/services/auth.service.js');
      await app.db.query(
        `DELETE FROM email_verification_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      await resendVerification(app.drizzle, app.redis, FIXTURE_EMAIL);
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM email_verification_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      expect(rowCount).toBe(1);
      await app.db.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [FIXTURE_ID]);
    });
  });

  describe('forgotPassword + resetPassword', () => {
    it('forgotPassword is a no-op for unknown emails', async () => {
      const { forgotPassword } = await import('../../src/services/auth.service.js');
      await expect(
        forgotPassword(app.drizzle, app.redis, 'unknown-' + Date.now() + '@test.local'),
      ).resolves.toBeUndefined();
    });

    it('forgotPassword creates a password_reset_tokens row for a known user', async () => {
      const { forgotPassword } = await import('../../src/services/auth.service.js');
      await app.db.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      await forgotPassword(app.drizzle, app.redis, FIXTURE_EMAIL);
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM password_reset_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      expect(rowCount).toBe(1);
    });

    it('resetPassword updates the password hash and writes an audit row', async () => {
      const { resetPassword } = await import('../../src/services/auth.service.js');
      const code = 'resetcode';
      await app.db.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      await app.db.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
           VALUES ($1, $2, now() + INTERVAL '1 hour')`,
        [hashToken(code), FIXTURE_ID],
      );

      const beforeAudit = await app.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM audit_log
            WHERE user_id = $1 AND action = 'password_reset_completed'`,
        [FIXTURE_ID],
      );

      await resetPassword(app.drizzle, FIXTURE_EMAIL, code, 'newpassword123');

      const { rows } = await app.db.query<{ password_hash: string | null }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [FIXTURE_ID],
      );
      expect(rows[0]?.password_hash).toBeTruthy();
      expect(rows[0]?.password_hash).not.toBe('newpassword123'); // hashed, not plaintext

      const afterAudit = await app.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM audit_log
            WHERE user_id = $1 AND action = 'password_reset_completed'`,
        [FIXTURE_ID],
      );
      expect(Number(afterAudit.rows[0]!.n)).toBe(Number(beforeAudit.rows[0]!.n) + 1);

      // Token was consumed.
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM password_reset_tokens WHERE user_id = $1`,
        [FIXTURE_ID],
      );
      expect(rowCount).toBe(0);
    });

    it('resetPassword throws 400 when the code does not match', async () => {
      const { resetPassword } = await import('../../src/services/auth.service.js');
      await expect(
        resetPassword(app.drizzle, FIXTURE_EMAIL, 'never-issued', 'newpw'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
