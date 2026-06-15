import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

// Mock the suppression service before importing the handler so the import
// graph picks up the mock. The handler is the only thing we exercise; the
// real suppress() function is integration-tested elsewhere.
vi.mock('../../src/services/email-suppressions.service.js', () => ({
  suppress: vi.fn().mockResolvedValue(undefined),
}));

import { handleSesEvent, type SesEvent } from '../../src/services/ses-event-handler.js';
import { suppress } from '../../src/services/email-suppressions.service.js';

// We never touch the pool, but the signature requires one.
const db = {} as Pool;

beforeEach(() => {
  vi.mocked(suppress).mockClear();
});

describe('handleSesEvent', () => {
  describe('Bounce events', () => {
    it('suppresses every recipient on a Permanent bounce', async () => {
      const event: SesEvent = {
        notificationType: 'Bounce',
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [
            { emailAddress: 'a@example.com', diagnosticCode: '550 user unknown' },
            { emailAddress: 'b@example.com' },
          ],
        },
      };

      const n = await handleSesEvent(db, event);

      expect(n).toBe(2);
      expect(vi.mocked(suppress)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(suppress).mock.calls[0]?.[1]).toBe('a@example.com');
      expect(vi.mocked(suppress).mock.calls[0]?.[2]).toMatchObject({
        reason: 'bounce',
        bounceType: 'Permanent',
        bounceSubtype: 'General',
        diagnosticCode: '550 user unknown',
      });
    });

    it('skips Transient bounces — SES will retry them', async () => {
      // The CLAUDE.md SES rule says transient bounces must never suppress; this
      // test is the regression guard for that rule.
      const event: SesEvent = {
        notificationType: 'Bounce',
        bounce: {
          bounceType: 'Transient',
          bouncedRecipients: [{ emailAddress: 'temp@example.com' }],
        },
      };

      const n = await handleSesEvent(db, event);
      expect(n).toBe(0);
      expect(vi.mocked(suppress)).not.toHaveBeenCalled();
    });

    it('skips Undetermined bounces', async () => {
      const event: SesEvent = {
        notificationType: 'Bounce',
        bounce: {
          bounceType: 'Undetermined',
          bouncedRecipients: [{ emailAddress: 'maybe@example.com' }],
        },
      };
      expect(await handleSesEvent(db, event)).toBe(0);
      expect(vi.mocked(suppress)).not.toHaveBeenCalled();
    });

    it('passes null for missing optional fields rather than undefined', async () => {
      const event: SesEvent = {
        notificationType: 'Bounce',
        bounce: {
          bounceType: 'Permanent',
          bouncedRecipients: [{ emailAddress: 'a@example.com' }],
        },
      };
      await handleSesEvent(db, event);
      expect(vi.mocked(suppress).mock.calls[0]?.[2]).toMatchObject({
        bounceSubtype: null,
        diagnosticCode: null,
      });
    });
  });

  describe('Complaint events', () => {
    it('suppresses every complaining recipient', async () => {
      const event: SesEvent = {
        notificationType: 'Complaint',
        complaint: {
          complaintFeedbackType: 'abuse',
          complainedRecipients: [
            { emailAddress: 'angry@example.com' },
            { emailAddress: 'also-angry@example.com' },
          ],
        },
      };
      const n = await handleSesEvent(db, event);
      expect(n).toBe(2);
      expect(vi.mocked(suppress)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(suppress).mock.calls[0]?.[2]).toMatchObject({
        reason: 'complaint',
      });
    });
  });

  describe('Unknown event types', () => {
    it('returns 0 and does nothing for an unrecognised notificationType', async () => {
      // Cast through unknown to satisfy the discriminated union without
      // weakening the production type.
      const event = { notificationType: 'Delivery' } as unknown as SesEvent;
      expect(await handleSesEvent(db, event)).toBe(0);
      expect(vi.mocked(suppress)).not.toHaveBeenCalled();
    });
  });
});
