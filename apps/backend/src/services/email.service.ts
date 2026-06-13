import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Pool } from 'pg';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from '../env.js';
import { isSuppressed } from './email-suppressions.service.js';
import { mintUnsubToken } from './email-unsubscribe.service.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    if (env.SMTP_HOST) {
      _transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        ignoreTLS: true,
        auth: undefined,
      });
    } else {
      const sesClient = new SESv2Client({ region: env.UPLOADS_REGION });
      _transporter = nodemailer.createTransport({
        SES: { sesClient, SendEmailCommand },
      });
    }
  }
  return _transporter;
}

// Bail out before the wire call if this address is on our suppression list
// (populated by the SES bounce/complaint SNS handler). Sending again to a
// known-bad address is the failure mode SES penalises hardest.
async function shouldSkip(db: Pool, email: string): Promise<boolean> {
  if (await isSuppressed(db, email)) {
    console.warn(`[email] skipping send to suppressed address: ${email}`);
    return true;
  }
  return false;
}

export async function sendVerificationEmail(
  db: Pool,
  toEmail: string,
  username: string,
  code: string,
): Promise<void> {
  if (await shouldSkip(db, toEmail)) return;
  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Verify your Cromo email address',
    text: [
      `Hi ${username},`,
      '',
      'Welcome to Cromo! Use the code below to verify your email address:',
      '',
      code,
      '',
      'Enter it on the verification page. This code expires in 24 hours.',
      '',
      'If you did not create an account, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>Welcome to Cromo! Use the code below to verify your email address:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:-apple-system,'Segoe UI',sans-serif;">${code}</p>
      <p>Enter it on the verification page. This code expires in <strong>24 hours</strong>.</p>
      <p>If you did not create an account, you can safely ignore this email.</p>
    `,
  });
}

// Rating reminders, trade-request notifications, and any other recipient-
// initiated-but-not-strictly-required mail must carry RFC 2369 + RFC 8058
// unsubscribe headers. Mailbox providers (Gmail, Yahoo) downgrade reputation
// on senders that omit these on bulk-ish transactional traffic, and SES
// reviewers explicitly look for them when assessing production-access
// requests.
//
// The List-Unsubscribe URL points at /api/v1/unsubscribe with a per-user
// signed token (services/email-unsubscribe.service.ts). One-click POSTs
// from Gmail/Yahoo flip user_settings columns directly; the user doesn't
// need to be logged in to opt out.
function unsubscribeHeaders(userId: string): Record<string, string> {
  const token = mintUnsubToken(userId, 'trade-messages');
  const unsubscribeUrl = `${env.FRONTEND_URL}/api/v1/unsubscribe?t=${token}`;
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function sendRatingReminderEmail(
  db: Pool,
  toEmail: string,
  username: string,
  tradeId: string,
  userId: string,
): Promise<void> {
  if (await shouldSkip(db, toEmail)) return;
  const tradeUrl = `${env.FRONTEND_URL}/trade/${tradeId}`;
  const unsubscribeUrl = `${env.FRONTEND_URL}/api/v1/unsubscribe?t=${mintUnsubToken(userId, 'trade-messages')}`;

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Rate your recent trade on Cromo',
    headers: unsubscribeHeaders(userId),
    text: [
      `Hi ${username},`,
      '',
      'You completed a trade on Cromo yesterday. Leaving a quick thumbs up or down helps other collectors trust their next swap.',
      '',
      tradeUrl,
      '',
      'You have up to 14 days from when the trade completed to leave a rating.',
      '',
      `To stop receiving these reminders, click here: ${unsubscribeUrl}`,
      `Or manage all email preferences at ${env.FRONTEND_URL}/settings.`,
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>You completed a trade on Cromo yesterday. A quick thumbs up or down helps other collectors trust their next swap.</p>
      <p><a href="${tradeUrl}">Rate this trade</a></p>
      <p>You have up to <strong>14 days</strong> from when the trade completed to leave a rating.</p>
      <hr>
      <p style="font-size:12px;color:#666;"><a href="${unsubscribeUrl}">Unsubscribe from rating reminders</a> · <a href="${env.FRONTEND_URL}/settings">manage all email preferences</a></p>
    `,
  });
}

export async function sendPasswordResetEmail(
  db: Pool,
  toEmail: string,
  username: string,
  code: string,
): Promise<void> {
  if (await shouldSkip(db, toEmail)) return;
  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Reset your Cromo password',
    text: [
      `Hi ${username},`,
      '',
      'We received a request to reset your Cromo password. Use the code below to choose a new password:',
      '',
      code,
      '',
      'Enter it on the password reset page. This code expires in 1 hour.',
      '',
      'If you did not request a password reset, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>We received a request to reset your Cromo password. Use the code below to choose a new password:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:-apple-system,'Segoe UI',sans-serif;">${code}</p>
      <p>Enter it on the password reset page. This code expires in <strong>1 hour</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}
