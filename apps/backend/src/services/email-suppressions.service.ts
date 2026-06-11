import type { Pool } from 'pg';

// Addresses that have hard-bounced or generated a complaint. The SQS poller
// in services/ses-poller.service.ts writes here on every bounce/complaint
// event; the email sender (email.service.ts) calls isSuppressed before every
// send. Keeping the read fast and unconditional is what protects us from
// sending to a known-bad address a second time — the failure mode SES
// penalises.

export async function isSuppressed(db: Pool, email: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM email_suppressions WHERE email = $1) AS exists',
    [email.toLowerCase()],
  );
  return result.rows[0]?.exists ?? false;
}

interface SuppressionDetails {
  reason: 'bounce' | 'complaint' | 'manual';
  bounceType?: string | null;
  bounceSubtype?: string | null;
  diagnosticCode?: string | null;
  payload?: unknown;
}

export async function suppress(
  db: Pool,
  email: string,
  details: SuppressionDetails,
): Promise<void> {
  await db.query(
    `INSERT INTO email_suppressions (email, reason, bounce_type, bounce_subtype, diagnostic_code, notification_payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       reason = EXCLUDED.reason,
       bounce_type = COALESCE(EXCLUDED.bounce_type, email_suppressions.bounce_type),
       bounce_subtype = COALESCE(EXCLUDED.bounce_subtype, email_suppressions.bounce_subtype),
       diagnostic_code = COALESCE(EXCLUDED.diagnostic_code, email_suppressions.diagnostic_code),
       notification_payload = EXCLUDED.notification_payload,
       suppressed_at = now()`,
    [
      email.toLowerCase(),
      details.reason,
      details.bounceType ?? null,
      details.bounceSubtype ?? null,
      details.diagnosticCode ?? null,
      details.payload ? JSON.stringify(details.payload) : null,
    ],
  );
}
