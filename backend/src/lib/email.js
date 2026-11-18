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
  const brevoReady = Boolean(env.BREVO_API_KEY && env.EMAIL_FROM_EMAIL);
  const smtpReady = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
  return brevoReady || smtpReady;
}

async function sendViaBrevo({ to, subject, text, html }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: env.EMAIL_FROM_EMAIL, name: env.EMAIL_FROM_NAME },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Brevo email delivery failed (${response.status}).`);
    error.statusCode = 502;
    error.providerDetail = detail.slice(0, 500);
    throw error;
  }
  return response.json().catch(() => ({}));
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

  if (env.BREVO_API_KEY && env.EMAIL_FROM_EMAIL) {
    return sendViaBrevo({ to, subject, text, html });
  }
  const mailer = getTransporter();
  return mailer.sendMail({
    from: env.SMTP_FROM || { name: 'T-CARE', address: env.SMTP_USER },
    to, subject, text, html,
    headers: { 'X-Auto-Response-Suppress': 'All' }
  });
}

export async function verifySmtpConnection() {
  if (env.BREVO_API_KEY && env.EMAIL_FROM_EMAIL) return true;
  return getTransporter().verify();
}

export async function sendPasswordResetCode({ to, fullName, code, expiresInMinutes }) {
  const safeName = escapeHtml(fullName || 'there');
  const subject = 'Reset your T-CARE password';
  const text = [
    `Hello ${fullName || 'there'},`,
    '',
    `Your T-CARE password reset code is: ${code}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    'If you did not request a password reset, you can ignore this email.'
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f0;padding:32px 12px;font-family:Arial,sans-serif;color:#243326"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5eadf;border-radius:16px;padding:32px"><p style="margin:0 0 18px;color:#66805b;font-size:12px;font-weight:700;letter-spacing:2px">T-CARE · ACCOUNT SECURITY</p><h1 style="font-size:24px;margin:0 0 12px">Reset your password</h1><p style="line-height:1.6">Hello ${safeName}, use this one-time code to reset your T-CARE password.</p><div style="margin:26px 0;padding:18px;background:#f3f7ed;border-radius:12px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700">${code}</div><p style="line-height:1.6;color:#596458">This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p><p style="font-size:12px;color:#818a7e;margin-top:28px">If you did not request this change, ignore this email. Your existing password will remain unchanged.</p></div></body></html>`;
  if (env.BREVO_API_KEY && env.EMAIL_FROM_EMAIL) return sendViaBrevo({ to, subject, text, html });
  return getTransporter().sendMail({
    from: env.SMTP_FROM || { name: 'T-CARE', address: env.SMTP_USER },
    to, subject, text, html,
    headers: { 'X-Auto-Response-Suppress': 'All' }
  });
}

export async function sendPaymentReceiptEmail(receipt) {
  const paymentStatus = String(receipt.paymentStatus || 'PAID').replaceAll('_', ' ');
  const safe = {
    name: escapeHtml(receipt.recipientName || 'Customer'),
    number: escapeHtml(receipt.receiptNumber),
    purpose: escapeHtml(receipt.purpose),
    transaction: escapeHtml(receipt.transactionId),
    method: escapeHtml(receipt.paymentMethod),
    status: escapeHtml(paymentStatus),
    amount: escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: receipt.currency || 'INR' }).format(Number(receipt.amount))),
    paidAt: escapeHtml(new Date(receipt.paidAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }))
  };
  const subject = `T-CARE payment receipt ${receipt.receiptNumber}`;
  const text = [
    `Hello ${receipt.recipientName || 'Customer'},`,
    '',
    'Thank you. T-CARE has recorded this payment.',
    `Receipt: ${receipt.receiptNumber}`,
    `Purpose: ${receipt.purpose}`,
    `Original amount paid: ${safe.amount}`,
    `Payment method: ${receipt.paymentMethod}`,
    `Transaction ID: ${receipt.transactionId}`,
    `Payment date: ${safe.paidAt}`,
    `Current payment status: ${paymentStatus}`,
    '',
    'Please keep this email for your records.'
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f0;padding:32px 12px;font-family:Arial,sans-serif;color:#243326"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5eadf;border-radius:16px;padding:30px"><p style="margin:0 0 16px;color:#66805b;font-size:12px;font-weight:700;letter-spacing:2px">T-CARE · PAYMENT RECEIPT</p><h1 style="font-size:24px;margin:0 0 8px">Payment receipt</h1><p style="line-height:1.6">Hello ${safe.name}, this receipt records the original payment. Keep it for your records.</p><div style="margin:22px 0;padding:18px;background:#f3f7ed;border-radius:12px"><small style="display:block;color:#596458">Original amount paid</small><strong style="font-size:30px">${safe.amount}</strong><div style="margin-top:8px;color:#596458;font-size:13px">Current status: ${safe.status}</div></div><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:9px 0;color:#667266">Receipt</td><td style="padding:9px 0;text-align:right;font-weight:700">${safe.number}</td></tr><tr><td style="padding:9px 0;color:#667266">Purpose</td><td style="padding:9px 0;text-align:right">${safe.purpose}</td></tr><tr><td style="padding:9px 0;color:#667266">Transaction ID</td><td style="padding:9px 0;text-align:right;overflow-wrap:anywhere">${safe.transaction}</td></tr><tr><td style="padding:9px 0;color:#667266">Payment method</td><td style="padding:9px 0;text-align:right">${safe.method}</td></tr><tr><td style="padding:9px 0;color:#667266">Payment date</td><td style="padding:9px 0;text-align:right">${safe.paidAt}</td></tr></table><p style="margin-top:26px;color:#818a7e;font-size:12px">This is an electronically generated T-CARE receipt. For payment questions, contact T-CARE through the support details published on its website.</p></div></body></html>`;
  if (env.BREVO_API_KEY && env.EMAIL_FROM_EMAIL) return sendViaBrevo({ to: receipt.recipientEmail, subject, text, html });
  return getTransporter().sendMail({
    from: env.SMTP_FROM || { name: 'T-CARE', address: env.SMTP_USER },
    to: receipt.recipientEmail, subject, text, html,
    headers: { 'X-Auto-Response-Suppress': 'All' }
  });
}
