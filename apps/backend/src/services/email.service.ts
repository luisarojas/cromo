import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../env.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,      // Mailpit does not use TLS
      ignoreTLS: true,
      auth: undefined,    // No auth for local Mailpit
    });
  }
  return _transporter;
}

export async function sendVerificationEmail(
  toEmail: string,
  username: string,
  token: string
): Promise<void> {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Verify your Cromo email address',
    text: [
      `Hi ${username},`,
      '',
      'Welcome to Cromo! Please verify your email address by clicking the link below:',
      '',
      verifyUrl,
      '',
      'This link expires in 24 hours.',
      '',
      'If you did not create an account, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>Welcome to Cromo! Please verify your email address by clicking the button below:</p>
      <p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 24px;background:#0A0B0F;color:#6EE7F9;border:1px solid #2A2E3A;border-radius:8px;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-weight:600;">
          Verify Email
        </a>
      </p>
      <p>Or copy this link into your browser:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      <p>If you did not create an account, you can safely ignore this email.</p>
    `,
  });
}

export async function sendRatingReminderEmail(
  toEmail: string,
  username: string,
  tradeId: string,
): Promise<void> {
  const tradeUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/trade/${tradeId}`;

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
  token: string
): Promise<void> {
  const resetUrl = `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/reset-password?token=${token}`;

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'Reset your Cromo password',
    text: [
      `Hi ${username},`,
      '',
      'We received a request to reset your Cromo password. Click the link below to choose a new password:',
      '',
      resetUrl,
      '',
      'This link expires in 1 hour.',
      '',
      'If you did not request a password reset, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>We received a request to reset your Cromo password. Click the button below to choose a new password:</p>
      <p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#0A0B0F;color:#6EE7F9;border:1px solid #2A2E3A;border-radius:8px;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-weight:600;">
          Reset Password
        </a>
      </p>
      <p>Or copy this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in <strong>1 hour</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}
