import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

// Capture every sendMail invocation so we can assert on its argument.
const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'fake' });
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

// AWS SES client is only constructed when SMTP_HOST is unset; mock both
// anyway so the import graph is clean either way.
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn().mockImplementation(() => ({})),
  SendEmailCommand: vi.fn(),
}));

// shouldSkip → isSuppressed gate. Default to "not suppressed" so the
// happy-path sends through; individual tests can override.
const isSuppressedMock = vi.fn().mockResolvedValue(false);
vi.mock('../../src/services/email-suppressions.service.js', () => ({
  isSuppressed: (db: unknown, email: string) => isSuppressedMock(db, email),
}));

// Predictable unsubscribe token so we can assert on the resulting URL.
vi.mock('../../src/services/email-unsubscribe.service.js', () => ({
  mintUnsubToken: (userId: string, scope: string) => `unsub-${userId}-${scope}`,
}));

vi.mock('../../src/env.js', () => ({
  env: {
    SMTP_HOST: 'mailpit',
    SMTP_PORT: 1025,
    EMAIL_FROM: 'noreply@cromo.test',
    FRONTEND_URL: 'https://cromo.test',
    UPLOADS_REGION: 'ca-central-1',
  },
}));

import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRatingReminderEmail,
} from '../../src/services/email.service.js';

const db = {} as Pool;

beforeEach(() => {
  sendMailMock.mockClear();
  isSuppressedMock.mockReset().mockResolvedValue(false);
});

describe('sendVerificationEmail', () => {
  it('sends a mail with the 6-digit code in both text and html bodies', async () => {
    await sendVerificationEmail(db, 'a@b.c', 'luisa', '123456');
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0]![0] as {
      from: string; to: string; subject: string; text: string; html: string;
    };
    expect(arg.from).toBe('noreply@cromo.test');
    expect(arg.to).toBe('a@b.c');
    expect(arg.subject).toMatch(/Verify/i);
    expect(arg.text).toContain('luisa');
    expect(arg.text).toContain('123456');
    expect(arg.html).toContain('123456');
  });

  it('is a no-op when the address is on the suppression list', async () => {
    isSuppressedMock.mockResolvedValueOnce(true);
    await sendVerificationEmail(db, 'a@b.c', 'luisa', '123456');
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends the reset code with a 1-hour expiry copy', async () => {
    await sendPasswordResetEmail(db, 'a@b.c', 'luisa', '999000');
    const arg = sendMailMock.mock.calls[0]![0] as { subject: string; text: string; html: string };
    expect(arg.subject).toMatch(/Reset/i);
    expect(arg.text).toContain('999000');
    expect(arg.text).toMatch(/1 hour/i);
    expect(arg.html).toContain('999000');
  });

  it('respects the suppression list', async () => {
    isSuppressedMock.mockResolvedValueOnce(true);
    await sendPasswordResetEmail(db, 'a@b.c', 'luisa', '000');
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendRatingReminderEmail', () => {
  it('attaches List-Unsubscribe + List-Unsubscribe-Post one-click headers', async () => {
    await sendRatingReminderEmail(db, 'a@b.c', 'luisa', 'trade-1', 'user-1');
    const arg = sendMailMock.mock.calls[0]![0] as {
      headers: Record<string, string>; text: string; html: string;
    };
    // RFC 8058: one-click unsubscribe requires both headers, and the URL
    // must be the same the body links to.
    expect(arg.headers['List-Unsubscribe']).toBe(
      '<https://cromo.test/api/v1/unsubscribe?t=unsub-user-1-trade-messages>',
    );
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(arg.text).toContain('https://cromo.test/trade/trade-1');
  });

  it('embeds the manage-preferences link', async () => {
    await sendRatingReminderEmail(db, 'a@b.c', 'luisa', 't', 'user-1');
    const arg = sendMailMock.mock.calls[0]![0] as { html: string; text: string };
    expect(arg.text).toContain('https://cromo.test/settings');
    expect(arg.html).toContain('https://cromo.test/settings');
  });

  it('respects the suppression list', async () => {
    isSuppressedMock.mockResolvedValueOnce(true);
    await sendRatingReminderEmail(db, 'a@b.c', 'luisa', 't', 'u');
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
