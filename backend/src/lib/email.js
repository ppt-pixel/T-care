import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

export class EmailDeliveryConfigurationError extends Error {
  constructor() {
    super('Email delivery is not configured. Set SMTP_USER and SMTP_PASSWORD in backend/.env.');
    this.name = 'EmailDeliveryConfigurationError';
    this.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    this.statusCode = 503;
  }
}

export function isEmailDeliveryConfigured() {
  return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!isEmailDeliveryConfigured()) throw new EmailDeliveryConfigurationError();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' }
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export async function sendEmailVerificationCode({ to, fullName, code, expiresInMinutes }) {
  const mailer = getTransporter();
  const safeName = escapeHtml(fullName || 'there');
  const subject = 'Verify your email address — T-CARE';
  const text = [
    `Hello ${fullName || 'there'},`,
    '',
    `Your T-CARE email verification code is: ${code}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    'If you did not create a T-CARE account, you can ignore this email.'
  ].join('\n');
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f4f6f0;padding:32px 12px;font-family:Arial,sans-serif;color:#243326">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5eadf;border-radius:16px;padding:32px">
    <p style="margin:0 0 18px;color:#66805b;font-size:12px;font-weight:700;letter-spacing:2px">T-CARE · PLANT CARE</p>
    <h1 style="font-size:24px;margin:0 0 12px">Verify your email</h1>
    <p style="line-height:1.6">Hello ${safeName}, use this one-time code to verify your T-CARE account.</p>
    <div style="margin:26px 0;padding:18px;background:#f3f7ed;border-radius:12px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700">${code}</div>
    <p style="line-height:1.6;color:#596458">This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
    <p style="font-size:12px;color:#818a7e;margin-top:28px">If you did not create a T-CARE account, you can safely ignore this message.</p>
  </div>
</body></html>`;

  return mailer.sendMail({
    from: env.SMTP_FROM || { name: 'T-CARE', address: env.SMTP_USER },
    to,
    subject,
    text,
    html,
    headers: { 'X-Auto-Response-Suppress': 'All' }
  });
}

export async function verifySmtpConnection() {
  return getTransporter().verify();
}
