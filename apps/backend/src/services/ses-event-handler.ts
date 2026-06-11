import type { Pool } from 'pg';
import { suppress } from './email-suppressions.service.js';

// Shape of an SES Bounce notification as emitted by an event-destination
// configuration set publishing to SNS/SQS. See the SES "Event publishing"
// schema docs for the full envelope.
interface SesBounceEvent {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType?: string;
    bouncedRecipients: { emailAddress: string; diagnosticCode?: string }[];
  };
}

interface SesComplaintEvent {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: { emailAddress: string }[];
    complaintFeedbackType?: string;
  };
}

export type SesEvent = SesBounceEvent | SesComplaintEvent;

/**
 * Process one SES bounce/complaint event from the SQS queue and update the
 * suppression table. Transient bounces are deliberately skipped — SES retries
 * them on the next send, and suppressing them would cost real users their mail.
 */
export async function handleSesEvent(db: Pool, event: SesEvent): Promise<number> {
  if (event.notificationType === 'Bounce') {
    if (event.bounce.bounceType !== 'Permanent') return 0;
    for (const recipient of event.bounce.bouncedRecipients) {
      await suppress(db, recipient.emailAddress, {
        reason: 'bounce',
        bounceType: event.bounce.bounceType,
        bounceSubtype: event.bounce.bounceSubType ?? null,
        diagnosticCode: recipient.diagnosticCode ?? null,
        payload: event,
      });
    }
    return event.bounce.bouncedRecipients.length;
  }

  if (event.notificationType === 'Complaint') {
    for (const recipient of event.complaint.complainedRecipients) {
      await suppress(db, recipient.emailAddress, {
        reason: 'complaint',
        payload: event,
      });
    }
    return event.complaint.complainedRecipients.length;
  }

  return 0;
}
