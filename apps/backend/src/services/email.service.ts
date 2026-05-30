import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from '../env.js';

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

export async function sendVerificationEmail(
  toEmail: string,
  username: string,
  code: string
): Promise<void> {
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

export async function sendRatingReminderEmail(
  toEmail: string,
  username: string,
  tradeId: string,
): Promise<void> {
  const tradeUrl = `${env.FRONTEND_URL}/trade/${tradeId}`;

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Rate your recent trade on Cromo',
    text: [
      `Hi ${username},`,
      '',
      'You completed a trade on Cromo yesterday. Leaving a quick thumbs up or down helps other collectors trust their next swap.',
      '',
      tradeUrl,
      '',
      'You have up to 14 days from when the trade completed to leave a rating.',
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>You completed a trade on Cromo yesterday. A quick thumbs up or down helps other collectors trust their next swap.</p>
      <p><a href="${tradeUrl}">Rate this trade</a></p>
      <p>You have up to <strong>14 days</strong> from when the trade completed to leave a rating.</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  username: string,
  code: string
): Promise<void> {
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
